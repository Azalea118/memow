"""Period boundaries and employee counters use Philippine business dates."""
import datetime as dt
import json


def seed(pt_client, monkeypatch):
    from pt_service import main as p
    day = dt.date(2026, 11, 13)  # Friday; week starts November 9
    monkeypatch.setattr(p, 'photo_business_date', lambda: day)
    rows = [
        ('Ana', 1, '2026-11-08T23:59:59'),
        ('Ana', 1, '2026-11-09T00:00:00'),
        ('Ana', 1, '2026-11-12T23:59:59'),
        ('Ana', 1, '2026-11-13T00:00:00'),
        ('Ana', 1, '2026-11-13T23:59:59'),
        ('Ana', 1, '2026-11-14T00:00:00'),
        ('Ana', 2, '2026-11-13T12:00:00'),
        ('José', 3, '2026-11-01T00:00:00'),
    ]
    with p.SessionLocal() as db:
        for name, employee_id, timestamp in rows:
            db.add(p.PhotoRecord(owner_name=name, filepath='uploads/fake.jpg',
                                timestamp=dt.datetime.fromisoformat(timestamp),
                                mobile_metadata=json.dumps({'employee_id': employee_id}),
                                display_name=name, tags='mobile', size_bytes=10))
        db.commit()
    return p


def test_photo_period_boundaries(pt_client, monkeypatch):
    seed(pt_client, monkeypatch)
    assert pt_client.get('/photos?timeframe=today').json()['total'] == 3
    assert pt_client.get('/photos?timeframe=week').json()['total'] == 5
    assert pt_client.get('/photos?timeframe=all').json()['total'] == 8
    assert pt_client.get('/photos?timeframe=month').status_code == 422
    assert pt_client.get('/photos?on_date=not-a-date').status_code == 422
    # Monday and midnight are inclusive, next midnight is exclusive.
    assert pt_client.get('/photos?timeframe=week&on_date=2026-11-09').json()['total'] == 1
    assert pt_client.get('/photos?timeframe=today&on_date=2026-11-12').json()['total'] == 1


def test_photo_summary_identity_and_zero_today(pt_client, monkeypatch):
    seed(pt_client, monkeypatch)
    stats = pt_client.get('/stats?include_employees=true').json()
    assert stats['timezone'] == 'Asia/Manila'
    assert stats['business_date'] == '2026-11-13'
    assert stats['uploads_today'] == 3
    assert stats['total_photos'] == 8
    counts = {r['employee_id']: r for r in stats['employee_counts']}
    assert counts[1]['uploads_today'] == 2
    assert counts[1]['total_uploads'] == 6
    assert counts[2]['total_uploads'] == 1  # same name, different employee
    assert counts[3]['uploads_today'] == 0
    assert counts[3]['owner'] == 'José'
    assert pt_client.get('/stats?owner=José').json()['total_photos'] == 1


def test_photo_pagination_and_combined_filters(pt_client, monkeypatch):
    seed(pt_client, monkeypatch)
    one = pt_client.get('/photos?timeframe=today&limit=2&offset=0').json()
    two = pt_client.get('/photos?timeframe=today&limit=2&offset=2').json()
    assert len({p['id'] for p in one['items'] + two['items']}) == 3
    assert pt_client.get('/photos?timeframe=week&owner=José').json()['total'] == 0
    assert pt_client.get('/photos?timeframe=all&q=José').json()['total'] == 1


def test_photo_week_year_boundary(pt_client, monkeypatch):
    p = seed(pt_client, monkeypatch)
    bounds = p.photo_time_bounds('week', dt.date(2027, 1, 1))
    assert bounds == (dt.datetime(2026, 12, 28), dt.datetime(2027, 1, 2))
