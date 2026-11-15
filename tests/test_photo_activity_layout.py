import datetime
import json

HEADERS={'X-Actor':'HR Manager'}

def test_author_title_survive_delete_and_filter(pt_client):
    from pt_service import main as pt
    author='Altia Rance'
    with pt.SessionLocal() as db:
        photo=pt.PhotoRecord(title='Gate 2 Inspection',owner_name=author,filepath='uploads/test.jpg',filename='test.jpg',mobile_metadata=json.dumps({'source':'camera'}))
        db.add(photo);db.flush()
        pid=photo.id
        pt.log_activity(db,author,'upload',photo)
        db.commit()
    feed=pt_client.get('/activity',headers=HEADERS,params={'author':author,'q':'Gate 2 Inspection'}).json()
    assert feed['total']==1
    assert feed['items'][0]['photo_title']=='Gate 2 Inspection'
    assert feed['items'][0]['author']==author
    assert pt_client.delete(f'/photos/{pid}',headers=HEADERS).status_code==200
    feed=pt_client.get('/activity',headers=HEADERS,params={'author':author}).json()
    assert feed['total']==2
    deletion=feed['items'][0]
    assert deletion['action']=='delete'
    assert deletion['actor']=='HR Manager'
    assert deletion['author']==author
    assert deletion['photo_title']=='Gate 2 Inspection'
    assert deletion['photo_exists'] is False
    history=pt_client.get(f'/photos/{pid}/history',headers=HEADERS).json()
    assert history['photo_display_name']=='Gate 2 Inspection'
    authors=pt_client.get('/activity/authors',headers=HEADERS).json()['actors']
    assert [a['actor'] for a in authors]==[author]
    day=deletion['created_at'][:10]
    digest=pt_client.get('/activity/digest',headers=HEADERS,params={'author':author,'from_date':day,'to_date':day}).json()
    assert digest['summary']=='1 upload · 1 deletion · 1 author'
    assert digest['days'][0]['summary']==digest['summary']
    assert pt_client.get('/activity',headers=HEADERS,params={'author':'HR Manager'}).json()['total']==0


def test_legacy_backfill_and_id_reuse(pt_client):
    from pt_service import main as pt
    with pt.SessionLocal() as db:
        # Same historical ID reused: old deletion must not acquire the new title/author.
        for action,actor,details in [('upload','Old Employee',{'upload_id':'old','source':'gallery'}),('delete','HR',{}),('upload','New Employee',{'upload_id':'new','title':'New Site','source':'camera'})]:
            db.add(pt.ActivityLog(photo_id=42,actor=actor,action=action,photo_display_name=actor,details=json.dumps(details)))
        db.commit()
    pt.ensure_schema();pt.ensure_schema()
    with pt.SessionLocal() as db:
        rows=db.query(pt.ActivityLog).order_by(pt.ActivityLog.id).all()
        assert rows[0].photo_title=='Untitled Photo'
        assert rows[1].photo_title=='Untitled Photo'
        assert rows[1].author=='Old Employee'
        assert rows[1].source=='gallery'
        assert rows[2].photo_title=='New Site'
        assert rows[2].author=='New Employee'
