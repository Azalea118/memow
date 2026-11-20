"""Direct account-store helpers shared by the auth service and app1.

The auth service remains the owner of the users table. app1 uses these helpers
when HR creates or edits an employee so the browser login and employee record
stay linked. SQLite is used directly because both services already share the
same data volume; calls are short and guarded by uniqueness constraints.
"""
import os
import sqlite3
import time
from contextlib import closing
from pathlib import Path

from auth.security import hash_password

BASE_DIR = Path(__file__).resolve().parent
ROLES = ("c_manager", "employee", "hr", "supervisor")
_SCHEMA_READY: set[Path] = set()


class AccountError(Exception):
    pass


class UsernameTaken(AccountError):
    pass


class EmployeeAlreadyLinked(AccountError):
    pass


def db_path() -> Path:
    return Path(os.getenv("AUTH_DB_PATH", BASE_DIR / "auth.db"))


def _connect() -> sqlite3.Connection:
    path = db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def ensure_schema() -> None:
    path = db_path().resolve()
    if path in _SCHEMA_READY and path.exists():
        return
    with closing(_connect()) as conn, conn:
        conn.execute("""CREATE TABLE IF NOT EXISTS users(
            id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL, created_at INTEGER NOT NULL,
            role TEXT NOT NULL DEFAULT 'employee')""")
        conn.execute("""CREATE TABLE IF NOT EXISTS sessions(
            token_hash TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            expires_at INTEGER NOT NULL)""")
        conn.execute("""CREATE TABLE IF NOT EXISTS devices(
            id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL,
            token_hash TEXT UNIQUE NOT NULL, revoked INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL, tracker_id INTEGER,
            expires_at INTEGER, last_used INTEGER)""")
        conn.execute("""CREATE TABLE IF NOT EXISTS trackers(
            id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL, disabled INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL, employee_id INTEGER,
            employee_code TEXT)""")
        conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS ux_tracker_employee "
            "ON trackers(employee_id) WHERE employee_id IS NOT NULL")
        cols = {row["name"] for row in conn.execute("PRAGMA table_info(users)")}
        for name, ddl in (
            ("first_name", "TEXT"),
            ("last_name", "TEXT"),
            ("disabled", "INTEGER NOT NULL DEFAULT 0"),
            ("employee_id", "INTEGER"),
            ("employee_code", "TEXT"),
        ):
            if name not in cols:
                conn.execute(f"ALTER TABLE users ADD COLUMN {name} {ddl}")
        conn.execute(
            "UPDATE users SET role='employee' "
            "WHERE role IS NULL OR role NOT IN (?,?,?,?)", ROLES)
        conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS ux_user_employee "
            "ON users(employee_id) WHERE employee_id IS NOT NULL")
    _SCHEMA_READY.add(path)


def create_account(*, employee_id: int, employee_code: str, username: str,
                   password: str, role: str, first_name: str,
                   last_name: str) -> int:
    if role not in ROLES:
        raise AccountError(f"Unknown role: {role}")
    ensure_schema()
    try:
        with closing(_connect()) as conn, conn:
            cur = conn.execute(
                "INSERT INTO users(username,password_hash,first_name,last_name,"
                "created_at,role,employee_id,employee_code) "
                "VALUES(?,?,?,?,?,?,?,?)",
                (username.strip(), hash_password(password), first_name,
                 last_name, int(time.time()), role, employee_id,
                 employee_code))
            return int(cur.lastrowid)
    except sqlite3.IntegrityError as exc:
        message = str(exc).lower()
        if "employee_id" in message:
            raise EmployeeAlreadyLinked(
                "This employee already has a login account.") from exc
        raise UsernameTaken(
            f"Login username {username!r} is already in use.") from exc


def update_account(employee_id: int, *, role: str | None = None,
                   first_name: str | None = None, last_name: str | None = None,
                   employee_code: str | None = None,
                   disabled: bool | None = None) -> bool:
    if role is not None and role not in ROLES:
        raise AccountError(f"Unknown role: {role}")
    ensure_schema()
    changes: dict[str, object] = {}
    for key, value in (("role", role), ("first_name", first_name),
                       ("last_name", last_name),
                       ("employee_code", employee_code)):
        if value is not None:
            changes[key] = value
    if disabled is not None:
        changes["disabled"] = int(disabled)
    with closing(_connect()) as conn, conn:
        row = conn.execute(
            "SELECT id FROM users WHERE employee_id=?", (employee_id,)
        ).fetchone()
        if row is None:
            return False
        if changes:
            assignments = ", ".join(f"{key}=?" for key in changes)
            conn.execute(
                f"UPDATE users SET {assignments} WHERE id=?",
                (*changes.values(), row["id"]))
        if disabled:
            conn.execute("DELETE FROM sessions WHERE user_id=?", (row["id"],))
    return True


def account_for_employee(employee_id: int) -> dict | None:
    ensure_schema()
    with closing(_connect()) as conn:
        row = conn.execute(
            "SELECT id, username, role, disabled FROM users WHERE employee_id=?",
            (employee_id,)).fetchone()
    return dict(row) if row else None


def delete_account(employee_id: int) -> None:
    ensure_schema()
    with closing(_connect()) as conn, conn:
        row = conn.execute(
            "SELECT id FROM users WHERE employee_id=?", (employee_id,)
        ).fetchone()
        if row:
            conn.execute("DELETE FROM devices WHERE tracker_id IN "
                         "(SELECT id FROM trackers WHERE employee_id=?)",
                         (employee_id,))
            conn.execute("DELETE FROM trackers WHERE employee_id=?",
                         (employee_id,))
            conn.execute("DELETE FROM users WHERE id=?", (row["id"],))


def delete_account_by_id(user_id: int) -> None:
    ensure_schema()
    with closing(_connect()) as conn, conn:
        conn.execute("DELETE FROM users WHERE id=?", (user_id,))


def disable_employee_trackers(employee_id: int) -> None:
    ensure_schema()
    with closing(_connect()) as conn, conn:
        conn.execute("UPDATE trackers SET disabled=1 WHERE employee_id=?",
                     (employee_id,))
        conn.execute(
            "UPDATE devices SET revoked=1 WHERE tracker_id IN "
            "(SELECT id FROM trackers WHERE employee_id=?)", (employee_id,))
