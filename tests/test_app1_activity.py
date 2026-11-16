from zoneinfo import ZoneInfo
import os
"""
Activity timeline / calendar / digest with real data.
Tests the audit-log read side, not just the "empty DB" case.
"""
from datetime import datetime, timezone

ACTOR = {"X-Actor": "test"}


def _emp(client, code, first="Alice", last="Smith"):
    r = client.post("/employees", json={
        "employee_code": code, "first_name": first, "last_name": last,
    }, headers=ACTOR)
    assert r.status_code == 201, r.text
    return r.json()


def _today_utc() -> str:
    return datetime.now(ZoneInfo(os.getenv("LOG_TIMEZONE", "UTC"))).date().isoformat()


def test_calendar_shows_today_activity(app1_client):
    _emp(app1_client, "CAL1")
    today = _today_utc()

    r = app1_client.get(f"/activity/calendar?start={today}&end={today}")
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    assert body[0]["date"] == today
    assert body[0]["total"] >= 1
    assert body[0]["employees"] >= 1


def test_daily_digest_highlights_employee_created(app1_client):
    _emp(app1_client, "DIG1", first="Diana", last="Prince")
    today = _today_utc()

    r = app1_client.get(f"/activity/digest/{today}")
    assert r.status_code == 200
    body = r.json()
    assert body["date"] == today
    assert body["total"] >= 1
    # by_action includes employee.created
    assert "employee.created" in body["by_action"]
    # highlights mentions the employee code
    joined = " ".join(body["highlights"])
    assert "DIG1" in joined


def test_timeline_filters_by_actor(app1_client):
    # One call as "alice", one as "bob"
    app1_client.post("/employees", json={
        "employee_code": "ACT_A", "first_name": "A", "last_name": "A",
    }, headers={"X-Actor": "alice"})
    app1_client.post("/employees", json={
        "employee_code": "ACT_B", "first_name": "B", "last_name": "B",
    }, headers={"X-Actor": "bob"})

    r = app1_client.get("/activity/timeline?actor=alice")
    assert r.status_code == 200
    actors = {e["actor"] for e in r.json()["items"]}
    assert actors == {"alice"}


def test_calendar_counts_type_and_subsection_changes(app1_client):
    from tests.violation_fixtures import make_type
    make_type(app1_client, "Calendar category")
    day = _today_utc()
    timeline = app1_client.get(f"/activity/timeline?day={day}")
    assert timeline.status_code == 200
    expected = sum(e["target_type"] in ("violation_type", "subsection") for e in timeline.json()["items"])
    assert expected >= 2
    calendar = app1_client.get(f"/activity/calendar?start={day}&end={day}")
    assert calendar.status_code == 200
    assert calendar.json()[0]["violation_types"] == expected
