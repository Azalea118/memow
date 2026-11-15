"""API regression coverage for HR-created accounts and authenticated photo upload."""
import datetime
import json
import sqlite3
import time
import uuid
from contextlib import closing

import pytest


@pytest.fixture
def linked_context(app1_client, auth_client, auth_user, monkeypatch):
    from db import engine
    from auth import main as auth
    monkeypatch.setenv('APP1_DB_PATH', str(engine.url.database))
    with closing(auth.db()) as c, c:
        c.execute('DELETE FROM devices WHERE tracker_id IN (SELECT id FROM trackers WHERE employee_id IS NOT NULL)')
        c.execute('DELETE FROM trackers WHERE employee_id IS NOT NULL')
    emp = app1_client.post('/employees', json={'employee_code':'MOB-'+uuid.uuid4().hex[:8], 'first_name':'José', 'last_name':'Peña'}, headers={'X-Actor':'HR'}).json()
    auth_client.post('/login', data={'username':auth_user[0], 'password':auth_user[1]}, follow_redirects=False)
    yield auth_client, emp, {'X-Requested-With':'Northpoint'}


def create(ctx, name=None):
    client, emp, headers = ctx
    username = name or 'phone-'+uuid.uuid4().hex[:10]
    result=client.post(f"/employees/{emp['id']}/mobile-access",headers=headers,json={'username':username,'password':'test-mobile-password'})
    assert result.status_code == 201, result.text
    login=client.post('/device-login', json={'username':username,'password':'test-mobile-password','device_id':'test-phone'})
    assert login.status_code==200
    return username, {'Authorization':'Bearer '+login.json()['token']}


def metadata(**changes):
    now=datetime.datetime.now(datetime.timezone.utc).isoformat()
    return {'upload_id':str(uuid.uuid4()), 'latitude':8.481, 'longitude':124.65, 'accuracy_m':8,
            'selected_at':now,'location_at':now,'source':'camera',**changes}


def send(client,headers,meta,file=b'\xff\xd8\xfftest'):
    return client.post('/mobile-upload',headers=headers,files={'file':('work.jpg',file,'image/jpeg')},data={'metadata':json.dumps(meta)})


def test_create_identity_and_duplicate(linked_context):
    client, emp, headers=linked_context
    username,token=create(linked_context)
    status=client.get(f"/employees/{emp['id']}/mobile-access")
    assert status.json()['account']['username']==username
    assert status.headers['cache-control']=='no-store'
    profile=client.get('/device-me',headers=token)
    assert profile.json()['full_name']=='José Peña'
    assert profile.json()['employee_id']==emp['id']
    duplicate=client.post(f"/employees/{emp['id']}/mobile-access",headers=headers,json={'username':'another-name','password':'test-mobile-password'})
    assert duplicate.status_code==409
    from auth import main as auth
    with closing(auth.db()) as c:
        row=c.execute('SELECT password_hash FROM trackers WHERE username=?',(username,)).fetchone()
        assert row['password_hash']!='test-mobile-password'
        assert auth.check_password('test-mobile-password',row['password_hash'])


def test_requires_browser_session_and_csrf_header(linked_context):
    client, emp, headers=linked_context
    path=f"/employees/{emp['id']}/mobile-access"
    body={'username':'bad-access','password':'test-mobile-password'}
    assert client.post(path,json=body).status_code==403
    _, token=create(linked_context)
    client.cookies.clear()
    assert client.get(path,headers=token).status_code==401
    assert client.post(path,json=body,headers={**headers,**token}).status_code==401


def test_upload_name_metadata_search_and_safe_retry(linked_context,pt_client):
    _, token=create(linked_context)
    meta=metadata()
    first=send(pt_client,token,meta)
    assert first.status_code==201, first.text
    assert first.json()['owner']=='José Peña'
    assert first.json()['mobile_metadata']['latitude']==8.481
    assert 'Philippine time' in first.json()['description']
    second=send(pt_client,token,meta)
    assert second.json()['id']==first.json()['id']
    listing=pt_client.get('/photos',params={'q':'José Peña'})
    assert listing.json()['total']==1
    assert pt_client.get(f"/photos/{first.json()['id']}/file").status_code==200
    from pt_service import main as pt
    with pt.SessionLocal() as db:
        assert db.query(pt.ActivityLog).filter_by(photo_id=first.json()['id']).count()==1


@pytest.mark.parametrize('changes',[{'accuracy_m':26},{'latitude':91},{'longitude':float('inf')},{'employee_id':999},{'full_name':'Forged Name'},{'location_at':'2000-01-01T00:00:00Z'}])
def test_bad_or_spoofed_metadata_rejected(linked_context,pt_client,changes):
    _,token=create(linked_context)
    assert send(pt_client,token,metadata(**changes)).status_code==422


def test_invalid_file_and_unauthenticated_upload(linked_context,pt_client):
    _, token=create(linked_context)
    assert send(pt_client,{},metadata()).status_code==401
    assert send(pt_client,token,metadata(),b'<script>fake image</script>').status_code==415


def test_disable_password_reset_and_inactive_employee(linked_context,pt_client,app1_client):
    client,emp,headers=linked_context
    username, token=create(linked_context)
    path=f"/employees/{emp['id']}/mobile-access"
    assert client.patch(path,headers=headers,json={'password':'changed-password-123'}).status_code==200
    assert client.get('/device-me',headers=token).status_code==401
    assert client.post('/device-login',json={'username':username,'password':'test-mobile-password','device_id':'p'}).status_code==401
    fresh=client.post('/device-login',json={'username':username,'password':'changed-password-123','device_id':'p'}).json()
    token={'Authorization':'Bearer '+fresh['token']}
    app1_client.post(f"/employees/{emp['id']}/deactivate",headers={'X-Actor':'HR'})
    assert send(pt_client,token,metadata()).status_code==403
    assert client.patch(path,headers=headers,json={'disabled':True}).status_code==200
    assert client.post('/device-login',json={'username':username,'password':'changed-password-123','device_id':'p'}).status_code==401


def test_legacy_link_is_explicit(linked_context):
    client,emp,headers=linked_context
    from auth import main as auth
    username='legacy-'+uuid.uuid4().hex[:8]
    with closing(auth.db()) as c,c:
        c.execute('INSERT INTO trackers(username,password_hash,created_at) VALUES(?,?,?)',(username,auth.hash_password('old-password'),int(time.time())))
    login=client.post('/device-login',json={'username':username,'password':'old-password','device_id':'p'}).json()
    token={'Authorization':'Bearer '+login['token']}
    assert client.get('/device-me',headers=token).status_code==403
    gps=client.get('/verify',headers={**token,'X-Original-Method':'POST','X-Original-URI':'/app3/'})
    assert gps.status_code==200
    result=client.post(f"/employees/{emp['id']}/mobile-access/link",headers=headers,json={'username':username,'password':'new-password-123'})
    assert result.status_code==200
    assert client.get('/device-me',headers=token).status_code==401
    login=client.post('/device-login',json={'username':username,'password':'new-password-123','device_id':'p'}).json()
    assert client.get('/device-me',headers={'Authorization':'Bearer '+login['token']}).json()['employee_id']==emp['id']


def test_device_route_allowlist_remains_narrow(linked_context):
    client,_,_=linked_context
    _,token=create(linked_context)
    client.cookies.clear()
    for method,path,status in [('POST','/app3/',200),('POST','/app2/mobile-upload',200),('GET','/app2/photos',401),('POST','/app2/upload',401),('POST','/app1/employees',401)]:
        response=client.get('/verify',headers={**token,'X-Original-Method':method,'X-Original-URI':path})
        assert response.status_code==status
