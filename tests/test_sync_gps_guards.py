import time
from tests.test_mobile_access import linked_context, create, metadata, send
from tests.test_mobile_title_edits import edit_payload


def test_mobile_patch_passes_gateway_then_checks_owner(linked_context, pt_client):
    auth, _, _ = linked_context
    _, token = create(linked_context)
    photo = send(pt_client, token, metadata(title='Original')).json()
    auth.cookies.clear()  # Critical: do not let an HR cookie bypass the device allowlist.
    path = f"/app2/mobile-photos/{photo['id']}/title"
    headers = {**token,'X-Original-Method':'PATCH','X-Original-URI':path}
    assert auth.get('/verify',headers=headers).status_code == 200
    response=pt_client.patch(path.removeprefix('/app2'),headers=token,json=edit_payload(photo,'Corrected',1))
    assert response.status_code == 200
    for method, target in [('GET',path),('DELETE',path),('PATCH','/app2/photos/1'),('PATCH',path+'/other'),('PATCH','/app2/mobile-photos/../title'),('GET','/app2/photos')]:
        assert auth.get('/verify',headers={**token,'X-Original-Method':method,'X-Original-URI':target}).status_code == 401


def test_stationary_anchor_coarse_and_teleport(gps_client):
    now=int(time.time());start=now-600
    fixes=[{'lat':8.157,'lon':125.127,'acc':10,'ts':t} for t in range(start,now-9,3)]
    fixes += [{'lat':8.6,'lon':124.7,'acc':10,'ts':now-6}, {'lat':8.6,'lon':124.7,'acc':411,'ts':now-3}, {'lat':8.157,'lon':125.127,'acc':11,'ts':now}]
    assert gps_client.post('/',json={'id':'stationary','points':fixes}).status_code == 200
    result=gps_client.get('/route/stationary').json()
    assert result['segments']==[[[8.157,125.127]]]
    device=gps_client.get('/devices').json()['devices'][0]
    assert device['accuracy_m']==11
    # Rejecting a coarse update must not display its accuracy or refresh location.
    gps_client.post('/',json={'id':'stationary','points':[{'lat':8.6,'lon':124.7,'acc':411,'ts':now+1}]})
    assert gps_client.get('/devices').json()['devices'][0]['accuracy_m']==11


def test_old_route_outliers_hidden_and_gaps_split(gps_client):
    from gps_service import main as gps
    now=int(time.time())
    with gps.SessionLocal() as db:
        for ts,lat,lon,acc in [(now-500,8.157,125.127,10),(now-498,8.6,124.7,None),(now-496,8.1571,125.127,10),(now-494,8.7,124.7,411),(now-10,8.158,125.128,10)]:
            db.add(gps.TrackPoint(device_id='old',ts=ts,lat=lat,lon=lon,accuracy_m=acc,segment=0))
        db.commit()
    result=gps_client.get('/route/old').json()
    assert len(result['segments'])==2
    assert all(p[0]<8.2 for seg in result['segments'] for p in seg)
    assert sum(len(seg) for seg in result['segments'])==3


def test_unknown_accuracy_and_invalid_fixes_not_live(gps_client):
    now=int(time.time())
    for point in [{'lat':8,'lon':125,'ts':now}, {'lat':8,'lon':125,'ts':now,'acc':-1}, {'lat':91,'lon':125,'ts':now,'acc':10}, {'lat':8,'lon':125,'ts':now+1000,'acc':10}]:
        response=gps_client.post('/',json={'id':'invalid','points':[point]})
        assert response.status_code == 200
        assert response.json()['saved']==0
    assert gps_client.get('/live/invalid').json()['status']=='not_connected'


def test_legacy_tracking_database_migrates_without_losing_today(tmp_path):
    import os,sqlite3,subprocess,sys
    database=tmp_path/'legacy.db'
    with sqlite3.connect(database) as db:
        db.execute('CREATE TABLE track_points(id INTEGER PRIMARY KEY,device_id TEXT NOT NULL,ts BIGINT NOT NULL,lat FLOAT NOT NULL,lon FLOAT NOT NULL,segment INTEGER NOT NULL)')
        db.execute('INSERT INTO track_points VALUES(1,?,?,?,?,?)',('legacy',int(time.time()),8.157,125.127,0))
    result=subprocess.run([sys.executable,'-c','from gps_service import main'],env={**os.environ,'GPS_DB_PATH':str(database)},capture_output=True,text=True)
    assert result.returncode==0,result.stderr
    with sqlite3.connect(database) as db:
        assert 'accuracy_m' in {row[1] for row in db.execute('PRAGMA table_info(track_points)')}
        assert db.execute('SELECT COUNT(*) FROM track_points').fetchone()[0]==1
