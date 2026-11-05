"""Tier-1 tests for gps_service (app3)."""
import time


def _batch(device_id, points):
    return {"id": device_id, "points": points}


def test_first_point_saved(gps_client):
    now = int(time.time())
    r = gps_client.post(
        "/", json=_batch("dev-A", [{"lat": 14.5995, "lon": 120.9842, "ts": now - 10}]),
    )
    assert r.status_code == 200
    assert r.json()["status"] == "success"
    assert r.json()["saved"] == 1


def test_live_after_receive(gps_client):
    now = int(time.time())
    gps_client.post(
        "/", json=_batch("dev-B", [{"lat": 14.6, "lon": 120.9, "ts": now - 5}]),
    )
    r = gps_client.get("/live/dev-B")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "online"
    assert body["lat"] == 14.6


def test_live_unknown_device(gps_client):
    r = gps_client.get("/live/nope")
    assert r.status_code == 200
    assert r.json()["status"] == "not_connected"


def test_devices_lists_online(gps_client):
    now = int(time.time())
    gps_client.post(
        "/", json=_batch("dev-C", [{"lat": 14.6, "lon": 120.9, "ts": now - 5}]),
    )
    r = gps_client.get("/devices")
    assert r.status_code == 200
    body = r.json()
    assert body["count"] >= 1
    assert any(d["device_id"] == "dev-C" for d in body["devices"])


def test_route_returns_segments(gps_client):
    now = int(time.time())
    gps_client.post(
        "/", json=_batch("dev-D", [{"lat": 14.6, "lon": 120.9, "ts": now - 5}]),
    )
    r = gps_client.get("/route/dev-D")
    assert r.status_code == 200
    assert isinstance(r.json()["segments"], list)


def test_device_binding_rejects_mismatched_id(gps_client):
    now = int(time.time())
    r = gps_client.post(
        "/",
        json=_batch("wrong-device", [{"lat": 14.6, "lon": 120.9, "ts": now - 5}]),
        headers={"X-Device": "alice:real-device"},
    )
    assert r.status_code == 403

def test_purge_deletes_yesterdays_points(gps_client):
    """Points with ts < midnight Asia/Manila are purged."""
    from gps_service import main as gps_main

    yesterday_ts = gps_main.day_start() - 1  # last second of yesterday
    with gps_main.SessionLocal() as db:
        db.add(gps_main.TrackPoint(
            device_id="purge-test",
            ts=yesterday_ts,
            lat=14.6, lon=120.9, segment=0,
        ))
        db.commit()
        assert db.query(gps_main.TrackPoint).filter_by(device_id="purge-test").count() == 1

    gps_main.purge()

    with gps_main.SessionLocal() as db:
        assert db.query(gps_main.TrackPoint).filter_by(device_id="purge-test").count() == 0


def test_purge_keeps_todays_points(gps_client):
    """Points with ts >= midnight are kept."""
    import time
    from gps_service import main as gps_main

    today_ts = int(time.time())
    with gps_main.SessionLocal() as db:
        db.add(gps_main.TrackPoint(
            device_id="keep-test",
            ts=today_ts,
            lat=14.6, lon=120.9, segment=0,
        ))
        db.commit()

    gps_main.purge()

    with gps_main.SessionLocal() as db:
        assert db.query(gps_main.TrackPoint).filter_by(device_id="keep-test").count() == 1


def test_purge_boundary_at_midnight(gps_client):
    """A point at exactly 00:00:00 today is kept (strict <)."""
    from gps_service import main as gps_main

    with gps_main.SessionLocal() as db:
        db.add(gps_main.TrackPoint(
            device_id="boundary-test",
            ts=gps_main.day_start(),
            lat=14.6, lon=120.9, segment=0,
        ))
        db.commit()

    gps_main.purge()

    with gps_main.SessionLocal() as db:
        assert db.query(gps_main.TrackPoint).filter_by(device_id="boundary-test").count() == 1


def test_purge_clears_state_when_rows_deleted(gps_client):
    """state dict is wiped when purge deletes at least one row."""
    from gps_service import main as gps_main

    # Pretend a device has in-memory state
    gps_main.state["dev-x"] = {
        "lat": 14.6, "lon": 120.9, "ts": 0, "seen": 0, "seg": 0,
        "rejects": 0, "moving": False, "pending": [], "window": [],
    }
    assert "dev-x" in gps_main.state

    # Insert an old point so purge has something to delete
    with gps_main.SessionLocal() as db:
        db.add(gps_main.TrackPoint(
            device_id="old-device",
            ts=gps_main.day_start() - 1,
            lat=14.6, lon=120.9, segment=0,
        ))
        db.commit()

    gps_main.purge()

    assert gps_main.state == {}


def test_purge_noop_when_nothing_old(gps_client):
    """Purge is idempotent — if nothing was deleted, state is NOT cleared."""
    from gps_service import main as gps_main

    gps_main.state["keep-dev"] = {"test": True}

    gps_main.purge()

    assert "keep-dev" in gps_main.state
