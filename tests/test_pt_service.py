"""
Core integration tests for pt_service — Stage 1.

Covers: POST /upload, GET /photos, GET /photos/{id}, DELETE, /rename,
history, /activity, /stats, /camera, /top-photos, /download.

Photo creation goes through /mobile-upload (the employee-only endpoint);
the legacy /upload route is intentionally 403 in the current service.
"""
import pytest


def test_upload_and_get(mobile_upload, pt_client):
    photo = mobile_upload("my.png", display_name="My Pic")
    assert photo["size_bytes"] > 0
    assert photo["owner"] == "Default Employee"
    assert photo["display_name"] == "My Pic"
    assert photo["filename"].endswith(".png")
    assert photo["tags"] == ["Mobile upload"]

    r = pt_client.get(f"/photos/{photo['id']}")
    assert r.status_code == 200
    assert r.json()["display_name"] == "My Pic"


def test_rejects_unknown_extension_415(mobile_upload):
    mobile_upload("evil.exe", status=415)


def test_empty_file_rejected_415(mobile_upload):
    mobile_upload("empty.png", content=b"", status=415)


def test_visible_in_list_paginated(mobile_upload, pt_client):
    for i in range(3):
        mobile_upload(f"p{i}.png")

    r = pt_client.get("/photos?limit=2&offset=0")
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 3
    assert len(body["items"]) == 2

    r = pt_client.get("/photos?limit=2&offset=2")
    assert len(r.json()["items"]) == 1


def test_upload_activity_recorded(mobile_upload, pt_client, actor_headers):
    mobile_upload(title="My Pic")
    r = pt_client.get("/activity", headers=actor_headers)
    assert r.status_code == 200
    log = r.json()["items"][0]
    assert log["action"] == "upload"
    assert log["photo_title"] == "My Pic"
    assert log["photo_display_name"] == "Default Employee"


def test_legacy_upload_is_403(pt_client, actor_headers):
    """Browser uploads moved to the employee-only /mobile-upload endpoint."""
    r = pt_client.post("/upload", headers=actor_headers)
    assert r.status_code == 403


def test_delete_requires_actor(mobile_upload, pt_client):
    photo = mobile_upload()
    r = pt_client.delete(f"/photos/{photo['id']}")
    assert r.status_code == 401


def test_delete_removes_file_and_record(mobile_upload, pt_client, actor_headers):
    from pt_service import main as pt_main

    photo = mobile_upload()
    stored = pt_main.UPLOAD_DIR / photo["filename"]
    assert stored.is_file()

    r = pt_client.delete(f"/photos/{photo['id']}", headers=actor_headers)
    assert r.status_code == 200
    assert r.json()["status"] == "deleted"
    assert not stored.is_file()
    assert pt_client.get(f"/photos/{photo['id']}").status_code == 404


def test_delete_404(pt_client, actor_headers):
    r = pt_client.delete("/photos/99999", headers=actor_headers)
    assert r.status_code == 404


def test_history_after_delete(mobile_upload, pt_client, actor_headers):
    photo = mobile_upload(display_name="Doomed Photo")
    pt_client.delete(f"/photos/{photo['id']}", headers=actor_headers)

    r = pt_client.get(f"/photos/{photo['id']}/history", headers=actor_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["photo_exists"] is False
    actions = {e["action"] for e in body["items"]}
    assert {"upload", "delete"} <= actions


def test_rename_no_rename_file_preserves_file(mobile_upload, pt_client,
                                              actor_headers):
    from pt_service import main as pt_main

    photo = mobile_upload("a.png")
    old_path = pt_main.UPLOAD_DIR / photo["filename"]
    assert old_path.is_file()

    r = pt_client.post(
        f"/photos/{photo['id']}/rename",
        json={"display_name": "New Title", "rename_file": False},
        headers=actor_headers,
    )
    assert r.status_code == 200
    assert r.json()["filename"] == photo["filename"]
    assert old_path.is_file()


def test_rename_with_rename_file(mobile_upload, pt_client, actor_headers):
    from pt_service import main as pt_main

    photo = mobile_upload("a.png")
    old_path = pt_main.UPLOAD_DIR / photo["filename"]

    r = pt_client.post(
        f"/photos/{photo['id']}/rename",
        json={"display_name": "Renamed Photo", "rename_file": True},
        headers=actor_headers,
    )
    assert r.status_code == 200
    new_filename = r.json()["filename"]
    assert new_filename != photo["filename"]
    assert not old_path.is_file()
    assert (pt_main.UPLOAD_DIR / new_filename).is_file()
    assert pt_client.get(f"/photos/{photo['id']}/file").content


def test_rename_404(pt_client, actor_headers):
    r = pt_client.post(
        "/photos/99999/rename",
        json={"display_name": "x"},
        headers=actor_headers,
    )
    assert r.status_code == 404


def test_activity_contains_rename(mobile_upload, pt_client, actor_headers):
    photo = mobile_upload()
    pt_client.post(
        f"/photos/{photo['id']}/rename",
        json={"display_name": "Renamed"},
        headers=actor_headers,
    )
    r = pt_client.get(
        f"/photos/{photo['id']}/history", headers=actor_headers
    )
    assert "edit" in {e["action"] for e in r.json()["items"]}


def test_catalog(pt_client):
    r = pt_client.get("/camera")
    assert r.status_code == 200
    assert "html" in r.headers["content-type"]
    assert b"Photo Library" in r.content


def test_activity_authors(mobile_upload, pt_client, actor_headers):
    mobile_upload(employee="alice")
    r = pt_client.get("/activity/authors", headers=actor_headers)
    assert r.status_code == 200
    authors = {a["actor"] for a in r.json()["actors"]}
    assert "alice" in authors


def test_activity_pagination(mobile_upload, pt_client, actor_headers):
    mobile_upload()
    mobile_upload()
    r1 = pt_client.get("/activity?limit=1&offset=0", headers=actor_headers)
    r2 = pt_client.get("/activity?limit=1&offset=1", headers=actor_headers)
    assert r1.json()["total"] >= 2
    assert len(r1.json()["items"]) == 1
    assert r1.json()["items"][0]["id"] != r2.json()["items"][0]["id"]


def test_activity_requires_actor(pt_client):
    from pt_service import main as pt_main
    if not pt_main.REQUIRE_ACTOR:
        pytest.skip("REQUIRE_ACTOR=0 in this env")
    r = pt_client.get("/activity")
    assert r.status_code == 401


def test_download_filename_sanitized(mobile_upload, pt_client):
    photo = mobile_upload(display_name="../../etc/passwd")
    r = pt_client.get(f"/photos/{photo['id']}/download")
    assert r.status_code == 200
    cd = r.headers["content-disposition"]
    assert ".." not in cd
    assert "/" not in cd


def test_get_nonexistent_photo_404(pt_client):
    r = pt_client.get("/photos/99999")
    assert r.status_code == 404


def test_db_timestamp_is_naive_local(mobile_upload):
    from pt_service import main as pt_main

    photo = mobile_upload()
    with pt_main.SessionLocal() as db:
        record = db.get(pt_main.PhotoRecord, photo["id"])
        assert record.timestamp is not None
        assert record.timestamp.tzinfo is None
        assert record.upload_key is not None


def test_size_bytes(mobile_upload):
    photo = mobile_upload()
    assert photo["size_bytes"] > 0
