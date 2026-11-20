"""Tier-1 tests for the auth service — the gate everything else depends on."""
import os
import secrets
import sqlite3
import time


def test_login_page_renders(auth_client):
    r = auth_client.get("/login")
    assert r.status_code == 200
    assert "<form" in r.text


def test_login_wrong_password_is_401(auth_client, auth_user):
    username, _ = auth_user
    r = auth_client.post(
        "/login",
        data={"username": username, "password": "wrong"},
        follow_redirects=False,
    )
    assert r.status_code == 401


def test_login_then_me(auth_client, auth_user):
    username, password = auth_user
    r = auth_client.post(
        "/login",
        data={"username": username, "password": password},
        follow_redirects=False,
    )
    assert r.status_code == 303
    assert "auth_session" in r.cookies

    r = auth_client.get("/me")
    assert r.status_code == 200
    assert r.json()["username"] == username


def test_verify_blocks_without_credentials(auth_client):
    r = auth_client.get("/verify")
    assert r.status_code == 401


def test_verify_succeeds_with_session(auth_client, auth_user):
    username, password = auth_user
    auth_client.post(
        "/login", data={"username": username, "password": password},
        follow_redirects=False,
    )
    r = auth_client.get(
        "/verify",
        headers={"x-original-method": "GET", "x-original-uri": "/app1/employees"},
    )
    assert r.status_code == 200
    assert r.headers.get("x-username") == username


def test_logout_clears_session(auth_client, auth_user):
    username, password = auth_user
    auth_client.post(
        "/login", data={"username": username, "password": password},
        follow_redirects=False,
    )
    assert auth_client.get("/me").status_code == 200
    auth_client.get("/logout", follow_redirects=False)
    assert auth_client.get("/me").status_code == 401


def test_device_token_scoped_to_post_app3(auth_client):
    """Device tokens may only POST /app3/* — enforced by /verify."""
    from auth.main import hash_password

    trk = f"trk_{secrets.token_hex(4)}"
    pwd = "devicepass"
    with sqlite3.connect(os.environ["AUTH_DB_PATH"]) as c:
        c.execute(
            "INSERT INTO trackers(username, password_hash, created_at) VALUES(?,?,?)",
            (trk, hash_password(pwd), int(time.time())),
        )

    r = auth_client.post(
        "/device-login",
        json={"username": trk, "password": pwd, "device_id": "phone-1"},
    )
    assert r.status_code == 200
    token = r.json()["token"]

    # Allowed: POST /app3/
    r = auth_client.get("/verify", headers={
        "authorization": f"Bearer {token}",
        "x-original-method": "POST",
        "x-original-uri": "/app3/",
    })
    assert r.status_code == 200
    assert r.headers.get("x-device") == f"{trk}:phone-1"

    # Blocked: GET /app3/live/x
    r = auth_client.get("/verify", headers={
        "authorization": f"Bearer {token}",
        "x-original-method": "GET",
        "x-original-uri": "/app3/live/x",
    })
    assert r.status_code == 401

    # Blocked: POST /app1/employees
    r = auth_client.get("/verify", headers={
        "authorization": f"Bearer {token}",
        "x-original-method": "POST",
        "x-original-uri": "/app1/employees",
    })
    assert r.status_code == 401


# ---------- role-based frontend routing ----------

def _role_user(role):
    from auth.main import hash_password

    username = f"role_{secrets.token_hex(4)}"
    password = "testpass123"
    with sqlite3.connect(os.environ["AUTH_DB_PATH"]) as c:
        c.execute(
            "INSERT INTO users(username, password_hash, created_at, role) VALUES(?,?,?,?)",
            (username, hash_password(password), int(time.time()), role),
        )
    return username, password


def test_login_redirects_to_role_home(auth_client):
    username, password = _role_user("hr")
    r = auth_client.post(
        "/login",
        data={"username": username, "password": password},
        follow_redirects=False,
    )
    assert r.status_code == 303
    assert r.headers["location"] == "/hr/index.html"

    me = auth_client.get("/me").json()
    assert me["role"] == "hr"
    assert me["role_home"] == "/hr/index.html"


def test_login_keeps_explicit_next(auth_client):
    username, password = _role_user("employee")
    r = auth_client.post(
        "/login",
        data={"username": username, "password": password, "next": "/app2/photos"},
        follow_redirects=False,
    )
    assert r.status_code == 303
    assert r.headers["location"] == "/app2/photos"


def test_verify_exposes_role_and_blocks_other_role_folders(auth_client):
    username, password = _role_user("hr")
    auth_client.post(
        "/login", data={"username": username, "password": password},
        follow_redirects=False,
    )

    def verify(path):
        return auth_client.get("/verify", headers={
            "x-original-method": "GET",
            "x-original-uri": path,
            "x-normalized-uri": path,
        })

    r = verify("/hr/index.html")
    assert r.status_code == 200
    assert r.headers["x-role"] == "hr"

    for path in ("/employee/index.html", "/c_manager/index.html",
                 "/supervisor/index.html"):
        assert verify(path).status_code == 403

    assert verify("/app1/employees").status_code == 200


def test_login_ignores_next_for_another_role_folder(auth_client):
    username, password = _role_user("employee")
    r = auth_client.post(
        "/login",
        data={"username": username, "password": password,
              "next": "/hr/index.html"},
        follow_redirects=False,
    )
    assert r.status_code == 303
    assert r.headers["location"] == "/employee/index.html"
