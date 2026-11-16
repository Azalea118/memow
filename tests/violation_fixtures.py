"""Create the current type -> subsection -> penalty hierarchy through public APIs."""
ACTOR = {"X-Actor": "test"}

def make_type(client, name="Lateness", is_active=True):
    r = client.post("/violation-types", json={"name": name, "is_active": is_active}, headers=ACTOR)
    assert r.status_code == 201, r.text
    vt = r.json()
    r = client.post(f"/violation-types/{vt['id']}/subsections", json={"name": name}, headers=ACTOR)
    assert r.status_code == 201, r.text
    vt["subsection_id"] = r.json()["id"]
    r = client.put(f"/subsections/{vt['subsection_id']}/penalties", json={"penalties": [
        {"offense_number": 1, "description": "Written warning"},
        {"offense_number": 2, "description": "Suspension"},
        {"offense_number": 3, "description": "Dismissal"},
    ]}, headers=ACTOR)
    assert r.status_code == 200, r.text
    return vt
