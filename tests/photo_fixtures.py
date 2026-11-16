"""Persist historical photos for dashboard API tests; do not reopen browser uploads."""
import datetime
import json
import uuid
from zoneinfo import ZoneInfo

def seed_photo(actor="test-actor", *, name="test.png", display_name=None, description=None, tags=None):
    from pt_service import main as pt
    payload = bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082")
    filename = uuid.uuid4().hex + ".png"
    (pt.UPLOAD_DIR / filename).write_bytes(payload)
    with pt.SessionLocal() as db:
        photo = pt.PhotoRecord(owner_name=actor, filename=filename, filepath="uploads/"+filename,
            original_filename=name, display_name=display_name or name, title=display_name or name,
            description=description, tags=tags, size_bytes=len(payload), content_type="image/png",
            timestamp=datetime.datetime.now(ZoneInfo("Asia/Manila")).replace(tzinfo=None))
        db.add(photo); db.flush()
        pt.log_activity(db, actor, "upload", photo, details={"original_filename":name})
        db.commit(); db.refresh(photo)
        return pt.serialize(photo)

def mobile_metadata():
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    return json.dumps(dict(upload_id=str(uuid.uuid4()), title="Test photo", latitude=8.15,
        longitude=125.12, accuracy_m=5, location_at=now, selected_at=now, source="camera"))
