"""
Filter correctness for /employees — including two KNOWN BUGS.

If `test_list_employees_search_total_is_consistent` or
`test_list_employees_department_total_is_consistent` fail, it's because
`count_employees` in queries.py doesn't mirror the filters that
`search_employees` applies. That's a real app bug, not a test bug.
"""
from tests.violation_fixtures import make_type
import pytest

ACTOR = {"X-Actor": "test"}


def _emp(client, code, first="Alice", last="Smith", dept=None):
    body = {"employee_code": code, "first_name": first, "last_name": last}
    if dept is not None:
        body["department"] = dept
    r = client.post("/employees", json=body, headers=ACTOR)
    assert r.status_code == 201, r.text
    return r.json()


def _vtype(client, name="Lateness", is_active=True):
    return make_type(client, name, is_active=is_active)


# ---------------- search ----------------

def test_search_by_first_name(app1_client):
    _emp(app1_client, "S1", first="Alice", last="Anderson")
    _emp(app1_client, "S2", first="Bob", last="Brown")
    r = app1_client.get("/employees?search=Alice")
    assert r.status_code == 200
    assert [e["employee_code"] for e in r.json()["items"]] == ["S1"]


def test_search_by_code(app1_client):
    _emp(app1_client, "CODE_X", first="A", last="A")
    _emp(app1_client, "CODE_Y", first="B", last="B")
    r = app1_client.get("/employees?search=CODE_X")
    assert [e["employee_code"] for e in r.json()["items"]] == ["CODE_X"]


# ---------------- KNOWN BUG: total ignores `search` ----------------

@pytest.mark.xfail(
    reason="Bug: count_employees ignores `search` — see app/routers/employees.py line 30. "
           "Un-xfail when queries.count_employees accepts the same filter set.",
    strict=True,
)
def test_list_employees_search_total_is_consistent(app1_client):
    """If 1 employee matches the search, total must be 1.

    Currently FAILS: count_employees doesn't accept `search`, so total
    reflects all employees. Frontend pagination will be wrong.
    """
    _emp(app1_client, "A1", first="Alice", last="Anderson")
    _emp(app1_client, "B1", first="Bob", last="Brown")
    _emp(app1_client, "C1", first="Carol", last="Clark")

    r = app1_client.get("/employees?search=Alice")
    body = r.json()
    assert len(body["items"]) == 1
    assert body["total"] == 1, (
        f"pagination total is wrong: items={len(body['items'])} total={body['total']}"
    )


# ---------------- KNOWN BUG: department substring vs exact ----------------

@pytest.mark.xfail(
    reason="Bug: search_employees uses ilike('%dept%'), count_employees uses ==. "
           "Un-xfail when count_employees matches substring semantics.",
    strict=True,
)
def test_list_employees_department_total_is_consistent(app1_client):
    """If items match `department=Engin` (substring), total must agree.

    Currently FAILS: search_employees uses ilike('%Engin%'), but
    count_employees uses exact equality. So items=1, total=0.
    """
    _emp(app1_client, "D1", dept="Engineering")
    _emp(app1_client, "D2", dept="Sales")

    r = app1_client.get("/employees?department=Engin")
    body = r.json()
    assert len(body["items"]) == 1
    assert body["total"] == 1, (
        f"total disagrees with items: items={len(body['items'])} total={body['total']}"
    )


# ---------------- minimum active violations / total offenses ----------------

def test_min_active_violations_filter(app1_client):
    a = _emp(app1_client, "MP_A")
    b = _emp(app1_client, "MP_B")
    vt = _vtype(app1_client, "Attendance")
    for emp, count in ((a, 1), (b, 2)):
        for _ in range(count):
            r = app1_client.post(f"/employees/{emp['id']}/violations", json={"subsection_id": vt["subsection_id"]}, headers=ACTOR)
            assert r.status_code == 201, r.text
    r = app1_client.get("/employees?min_active_violations=2")
    assert r.status_code == 200
    assert [e["employee_code"] for e in r.json()["items"]] == ["MP_B"]


def test_min_total_offenses_filter(app1_client):
    a = _emp(app1_client, "MS_A", first="A", last="A")
    b = _emp(app1_client, "MS_B", first="B", last="B")
    vt = _vtype(app1_client, "STR")
    for _ in range(2):
        app1_client.post(f"/employees/{a['id']}/violations",
                         json={"subsection_id": vt["subsection_id"]}, headers=ACTOR)
    app1_client.post(f"/employees/{b['id']}/violations",
                     json={"subsection_id": vt["subsection_id"]}, headers=ACTOR)

    r = app1_client.get("/employees?min_total_offenses=2")
    assert [e["employee_code"] for e in r.json()["items"]] == ["MS_A"]


# ---------------- active/inactive ----------------

def test_deactivated_excluded_from_default_search(app1_client):
    emp = _emp(app1_client, "INACT", first="Inactive", last="User")
    app1_client.post(f"/employees/{emp['id']}/deactivate", headers=ACTOR)

    r = app1_client.get("/employees")
    assert "INACT" not in [e["employee_code"] for e in r.json()["items"]]

    r = app1_client.get("/employees?include_inactive=true")
    assert "INACT" in [e["employee_code"] for e in r.json()["items"]]


def test_total_offenses_filter_includes_removed_records(app1_client):
    employee = _emp(app1_client, "REMOVED_HISTORY")
    _emp(app1_client, "NO_HISTORY")
    vt = _vtype(app1_client, "Attendance")
    for _ in range(2):
        response = app1_client.post(f"/employees/{employee['id']}/violations",
            json={"subsection_id": vt["subsection_id"]}, headers=ACTOR)
        assert response.status_code == 201, response.text
    response = app1_client.post(f"/employees/{employee['id']}/violations/clear",
        json={"reason": "Amnesty"}, headers=ACTOR)
    assert response.status_code == 200
    assert response.json()["deleted"] == 2
    response = app1_client.get("/employees?min_total_offenses=2")
    assert response.status_code == 200
    assert [e["employee_code"] for e in response.json()["items"]] == ["REMOVED_HISTORY"]
    assert response.json()["items"][0]["active_violation_count"] == 0
    assert response.json()["items"][0]["total_offenses"] == 2
    assert app1_client.get("/employees?min_active_violations=1").json()["items"] == []
