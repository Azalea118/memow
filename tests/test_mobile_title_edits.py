import json
import uuid
from tests.test_mobile_access import linked_context, create, metadata, send


def edit_payload(photo, title, revision):
    meta = photo['mobile_metadata']
    return dict(title=title, revision=revision, upload_id=meta['upload_id'],
                expected_tracker_id=meta['tracker_id'], expected_employee_id=meta['employee_id'],
                expected_employee_code=meta['employee_code'])


def test_title_edits_retry_order_history_and_metadata(linked_context, pt_client):
    from pt_service import main as pt
    _, token = create(linked_context)
    original = send(pt_client, token, metadata(title='Gate 2')).json()
    endpoint = f"/mobile-photos/{original['id']}/title"
    payload = edit_payload(original, '  Gate 3 Inspection  ', 1)
    first = pt_client.patch(endpoint, headers=token, json=payload)
    assert first.status_code == 200, first.text
    assert first.json()['title'] == 'Gate 3 Inspection'
    assert pt_client.patch(endpoint, headers=token, json=payload).json() == first.json()
    second = edit_payload(original, 'Warehouse', 2)
    assert pt_client.patch(endpoint, headers=token, json=second).status_code == 200
    late = pt_client.patch(endpoint, headers=token, json=payload)
    assert late.json()['revision'] == 2 and late.json()['title'] == 'Warehouse'
    assert pt_client.patch(endpoint, headers=token, json={**second, 'title':'Other'}).status_code == 409
    current = pt_client.get(f"/photos/{original['id']}").json()
    for field in ('mobile_metadata', 'location_name', 'timestamp', 'owner', 'filename', 'description', 'tags'):
        assert current.get(field) == original.get(field), field
    assert current['title'] == 'Warehouse'
    with pt.SessionLocal() as db:
        edits = db.query(pt.ActivityLog).filter_by(photo_id=original['id'],action='edit').order_by(pt.ActivityLog.id).all()
        assert len(edits) == 2
        assert json.loads(edits[0].details)['changes']['title'] == {'from':'Gate 2','to':'Gate 3 Inspection'}
        assert edits[1].photo_title == 'Warehouse'
    feed = pt_client.get('/activity', params={'action':'edit'}, headers={'X-Actor':'HR'}).json()
    assert len(feed['items']) == 2


def test_title_edit_security_and_validation(linked_context, pt_client, app1_client):
    _, token = create(linked_context)
    photo = send(pt_client, token, metadata(title='Gate')).json()
    url = f"/mobile-photos/{photo['id']}/title"
    body = edit_payload(photo, 'Gate 2', 1)
    assert pt_client.patch(url, json=body).status_code == 401
    for bad in ('', '  ', 'x'*121):
        assert pt_client.patch(url, headers=token, json={**body,'title':bad}).status_code == 422
    assert pt_client.patch(url, headers=token, json={**body,'expected_employee_id':999999}).status_code == 403
    assert pt_client.patch(url, headers=token, json={**body,'upload_id':str(uuid.uuid4())}).status_code == 403
    assert pt_client.patch(url, headers=token, json={**body,'latitude':9}).status_code == 422
    assert pt_client.patch('/mobile-photos/999999/title', headers=token, json=body).status_code == 404
    other = app1_client.post('/employees',json={'employee_code':'OTHER-'+uuid.uuid4().hex[:8], 'first_name':'José','last_name':'Peña'},headers={'X-Actor':'HR'}).json()
    auth_client, _, headers = linked_context
    _, other_token = create((auth_client,other,headers))
    other_info = auth_client.get('/device-me',headers=other_token).json()
    forged = {**body, **{'expected_'+key:other_info[key] for key in ('tracker_id','employee_id','employee_code')}}
    assert pt_client.patch(url,headers=other_token,json=forged).status_code == 403
    # Same display name does not grant ownership; immutable tracker/employee IDs govern edits.
    from pt_service import main as pt
    with pt.SessionLocal() as db:
        row = db.get(pt.PhotoRecord, photo['id'])
        info = json.loads(row.mobile_metadata); info['tracker_id'] += 100
        row.mobile_metadata = json.dumps(info); db.commit()
    assert pt_client.patch(url, headers=token, json=body).status_code == 403


def test_legacy_rename_stays_in_edits_filter(linked_context, pt_client):
    from pt_service import main as pt
    _, token = create(linked_context)
    photo = send(pt_client, token, metadata(title='Original')).json()
    with pt.SessionLocal() as db:
        pt.log_activity(db, 'HR', 'rename', db.get(pt.PhotoRecord,photo['id']), details={'display_name':{'from':'Old','to':'New'}})
        db.commit()
    response=pt_client.get('/activity', params={'action':'edit'},headers={'X-Actor':'HR'})
    assert response.status_code == 200
    assert response.json()['total'] == 1
    assert response.json()['items'][0]['action'] == 'edit'
    with pt.SessionLocal() as db:
        assert db.query(pt.ActivityLog).filter_by(action='rename').count() == 1
