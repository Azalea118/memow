"""
Filter correctness for /employees.
"""
ACTOR = {"X-Actor": "test"}


def _emp(client, code, first="Alice", last="Smith", dept=None):
    body = {"employee_code": code, "first_name": first, "last_name": last}
    if dept is not None:
        body["department"] = dept
    r = client.post("/employees", json=body, headers=ACTOR)
    assert r.status_code == 201, r.text
    return r.json()


def _vtype(client, name):
    r = client.post("/violation-types", json={"name": name}, headers=ACTOR)
    assert r.status_code == 201, r.text
    return r.json()


def _punishable_subsection(client, vtype):
    r = client.post(
        f"/violation-types/{vtype['id']}/subsections",
        json={"name": "Default"}, headers=ACTOR,
    )
    assert r.status_code == 201, r.text
    subsection = r.json()
    r = client.put(
        f"/subsections/{subsection['id']}/penalties",
        json={"penalties": [
            {"offense_number": 1, "description": "Warning"},
            {"offense_number": 2, "description": "Reprimand"},
        ]},
        headers=ACTOR,
    )
    assert r.status_code == 200, r.text
    return subsection


def _assign(client, employee_id, subsection_id):
    r = client.post(
        f"/employees/{employee_id}/violations",
        json={"subsection_id": subsection_id}, headers=ACTOR,
    )
    assert r.status_code == 201, r.text


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


# ---------------- total mirrors the applied filters ----------------

def test_list_employees_search_total_is_consistent(app1_client):
    """If 1 employee matches the search, total must be 1."""
    _emp(app1_client, "A1", first="Alice", last="Anderson")
    _emp(app1_client, "B1", first="Bob", last="Brown")
    _emp(app1_client, "C1", first="Carol", last="Clark")

    r = app1_client.get("/employees?search=Alice")
    body = r.json()
    assert len(body["items"]) == 1
    assert body["total"] == 1, (
        f"pagination total is wrong: items={len(body['items'])} total={body['total']}"
    )


# ---------------- department substring consistency ----------------

def test_list_employees_department_total_is_consistent(app1_client):
    """If items match `department=Engin` (substring), total must agree."""
    _emp(app1_client, "D1", dept="Engineering")
    _emp(app1_client, "D2", dept="Sales")

    r = app1_client.get("/employees?department=Engin")
    body = r.json()
    assert len(body["items"]) == 1
    assert body["total"] == 1, (
        f"total disagrees with items: items={len(body['items'])} total={body['total']}"
    )


# ---------------- active / all-time offense thresholds ----------------

def test_min_points_filter(app1_client):
    a = _emp(app1_client, "MP_A", first="A", last="A")
    b = _emp(app1_client, "MP_B", first="B", last="B")
    subsection = _punishable_subsection(app1_client, _vtype(app1_client, "V"))
    _assign(app1_client, a["id"], subsection["id"])
    _assign(app1_client, b["id"], subsection["id"])
    _assign(app1_client, b["id"], subsection["id"])

    r = app1_client.get("/employees?min_active_violations=2")
    codes = [e["employee_code"] for e in r.json()["items"]]
    assert codes == ["MP_B"]
    assert r.json()["total"] == 1


def test_min_strikes_filter(app1_client):
    a = _emp(app1_client, "MS_A", first="A", last="A")
    b = _emp(app1_client, "MS_B", first="B", last="B")
    subsection = _punishable_subsection(app1_client, _vtype(app1_client, "V"))
    _assign(app1_client, a["id"], subsection["id"])
    _assign(app1_client, a["id"], subsection["id"])
    _assign(app1_client, b["id"], subsection["id"])

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
