"""Tier-1 tests for pt_service (app2)."""
from tests.photo_fixtures import seed_photo
import io


def _png_bytes():
    # 1x1 transparent PNG
    return bytes.fromhex(
        "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
        "0000000a49444154789c6300010000050001"
        "0d0a2db40000000049454e44ae426082"
    )


def test_browser_upload_is_disabled(pt_client, actor_headers):
    for headers in ({}, actor_headers):
        r = pt_client.post("/upload", files={"file": ("a.png", _png_bytes(), "image/png")}, headers=headers)
        assert r.status_code == 403
    assert pt_client.get("/photos").json()["total"] == 0


def test_get_historical_photo(pt_client, actor_headers):
    body = seed_photo(display_name="Test photo")
    r = pt_client.get(f"/photos/{body['id']}")
    assert r.status_code == 200
    assert r.json()["owner"] == "test-actor"
    assert r.json()["display_name"] == "Test photo"


def test_list_photos(pt_client, actor_headers):
    seed_photo(name="b.png")
    r = pt_client.get("/photos")
    assert r.status_code == 200
    assert r.json()["total"] == 1


def test_delete_photo(pt_client, actor_headers):
    pid = seed_photo(name="c.png")["id"]
    r = pt_client.delete(f"/photos/{pid}", headers=actor_headers)
    assert r.status_code == 200
    assert r.json()["status"] == "deleted"
    assert pt_client.get(f"/photos/{pid}").status_code == 404


def test_activity_log_preserves_historical_upload(pt_client, actor_headers):
    seed_photo(name="d.png")
    r = pt_client.get("/activity", headers=actor_headers)
    assert r.status_code == 200
    assert r.json()["total"] == 1
    assert r.json()["items"][0]["action"] == "upload"
