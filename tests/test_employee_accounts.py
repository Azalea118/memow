"""Employee creation provisions and maintains the linked auth account."""
import os
import secrets
import sqlite3

import pytest

from auth import accounts
from auth.security import check_password

ACTOR = {"X-Actor": "hr-tester"}


@pytest.fixture(autouse=True)
def clean_account_store():
    accounts.ensure_schema()
    with sqlite3.connect(os.environ["AUTH_DB_PATH"]) as c:
        for table in ("sessions", "devices", "trackers", "users"):
            c.execute(f"DELETE FROM {table}")
    yield


def _auth_rows():
    with sqlite3.connect(os.environ["AUTH_DB_PATH"]) as c:
        c.row_factory = sqlite3.Row
        return c.execute("SELECT * FROM users ORDER BY id").fetchall()


def _create(client, **overrides):
    suffix = secrets.token_hex(4)
    body = {
        "employee_code": overrides.pop("employee_code", f"EMP-{suffix}"),
        "first_name": overrides.pop("first_name", "Ada"),
        "last_name": overrides.pop("last_name", "Lovelace"),
        "employee_type": overrides.pop("employee_type", "supervisor"),
        "account_username": overrides.pop("account_username", f"ada.{suffix}"),
        "account_password": overrides.pop("account_password", "verysecret123"),
    }
    body.update(overrides)
    return client.post("/employees", json=body, headers=ACTOR)


def test_create_employee_creates_linked_auth_account(app1_client):
    r = _create(app1_client)
    assert r.status_code == 201, r.text
    employee = r.json()
    assert employee["employee_type"] == "supervisor"

    user = next(row for row in _auth_rows()
                if row["employee_id"] == employee["id"])
    assert user["role"] == "supervisor"
    assert user["employee_code"] == employee["employee_code"]
    assert user["first_name"] == "Ada"
    assert user["disabled"] == 0
    assert check_password("verysecret123", user["password_hash"])


def test_duplicate_login_username_rolls_back_employee(app1_client):
    username = f"dupe.{secrets.token_hex(4)}"
    assert _create(app1_client, account_username=username).status_code == 201
    code = f"EMP-{secrets.token_hex(4)}"
    r = _create(app1_client, employee_code=code, account_username=username)
    assert r.status_code == 409
    assert app1_client.get(f"/employees/by-code/{code}").status_code == 404


def test_employee_type_update_syncs_auth_role(app1_client):
    employee = _create(app1_client).json()
    r = app1_client.patch(
        f"/employees/{employee['id']}",
        json={"employee_type": "employee"}, headers=ACTOR)
    assert r.status_code == 200, r.text
    assert r.json()["employee_type"] == "employee"
    user = next(row for row in _auth_rows() if row["employee_id"] == employee["id"])
    assert user["role"] == "employee"


def test_deactivate_disable_and_reactivate_enable_account(app1_client):
    employee = _create(app1_client).json()
    assert app1_client.post(
        f"/employees/{employee['id']}/deactivate", headers=ACTOR).status_code == 200
    user = next(row for row in _auth_rows() if row["employee_id"] == employee["id"])
    assert user["disabled"] == 1
    assert app1_client.post(
        f"/employees/{employee['id']}/reactivate", headers=ACTOR).status_code == 200
    user = next(row for row in _auth_rows() if row["employee_id"] == employee["id"])
    assert user["disabled"] == 0


def test_delete_employee_removes_auth_account(app1_client):
    employee = _create(app1_client).json()
    assert app1_client.delete(
        f"/employees/{employee['id']}", headers=ACTOR).status_code == 204
    assert not any(row["employee_id"] == employee["id"] for row in _auth_rows())
