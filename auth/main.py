import html, os, secrets, sqlite3, time
import unicodedata
import re
from contextlib import closing
from pathlib import Path

from fastapi import FastAPI, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse, Response, JSONResponse
from pydantic import BaseModel

from auth.security import hash_password, check_password, hash_token

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = Path(os.getenv("AUTH_DB_PATH", BASE_DIR / "auth.db"))
DB_PATH.parent.mkdir(parents=True, exist_ok=True)
PREFIX = "/auth"
COOKIE = "auth_session"
COOKIE_SECURE = os.getenv("AUTH_COOKIE_SECURE", "1") == "1"
SESSION_TTL = 7 * 24 * 3600
ROLES = ("c_manager", "employee", "hr", "supervisor")
DEFAULT_ROLE = "employee"
ROLE_HOME = {role: f"/{role}/index.html" for role in ROLES}
# what a device token may do: POST anywhere under /app3/, nothing else
DEVICE_ALLOWED_PREFIX = "/app3/"
DEVICE_ALLOWED_METHOD = "POST"
DEVICE_ALLOWED = {(DEVICE_ALLOWED_METHOD, DEVICE_ALLOWED_PREFIX), ("POST", "/app2/mobile-upload")}
LOGIN_HTML_PATH = Path(os.getenv(
    "LOGIN_HTML",
    BASE_DIR.parent / "frontend" / "northpoint" / "login.html",
))

SCHEMA = """
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL, created_at INTEGER NOT NULL,
  role TEXT NOT NULL DEFAULT 'employee',
  first_name TEXT, last_name TEXT,
  disabled INTEGER NOT NULL DEFAULT 0,
  employee_id INTEGER, employee_code TEXT);
CREATE TABLE IF NOT EXISTS sessions(
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS devices(
  id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL,
  token_hash TEXT UNIQUE NOT NULL, revoked INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL);
"""

_login_cache: dict = {"mtime": None, "html": None}

def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


with closing(db()) as _c:
    _c.executescript(SCHEMA)

DEVICE_TTL = 7 * 24 * 3600   # sliding inactivity window
RENEW_AFTER = 24 * 3600      # extend at most once a day

with closing(db()) as _c, _c:
    _c.execute("""CREATE TABLE IF NOT EXISTS trackers(
        id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL, disabled INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL)""")
    cols = {r["name"] for r in _c.execute("PRAGMA table_info(devices)")}
    for col in ("tracker_id", "expires_at", "last_used"):
        if col not in cols:
            _c.execute(f"ALTER TABLE devices ADD COLUMN {col} INTEGER")

with closing(db()) as _c, _c:
    ucols = {r["name"] for r in _c.execute("PRAGMA table_info(users)")}
    for col, ddl in (
        ("first_name", "TEXT"), ("last_name", "TEXT"),
        ("disabled", "INTEGER NOT NULL DEFAULT 0"),
        ("employee_id", "INTEGER"), ("employee_code", "TEXT"),
    ):
        if col not in ucols:
            _c.execute(f"ALTER TABLE users ADD COLUMN {col} {ddl}")
    if "role" not in ucols:
        _c.execute(
            "ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'employee'")
    _c.execute(
        "UPDATE users SET role=? WHERE role IS NULL OR role NOT IN (?,?,?,?)",
        (DEFAULT_ROLE, *ROLES))
    _c.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_user_employee "
        "ON users(employee_id) WHERE employee_id IS NOT NULL")


# ---------- hashing ----------
# Re-exported for the tests and CLI through auth.main.
__all__ = ["hash_password", "check_password", "hash_token"]

DUMMY_HASH = hash_password("dummy")  # keeps timing similar for unknown users


# ---------- helpers ----------
def full_name(row) -> str:
    n = f"{row['first_name'] or ''} {row['last_name'] or ''}".strip()
    return n or row["username"]          # old accounts fall back to the username


def header_safe(s: str) -> str:
    """HTTP headers must be plain ASCII-ish. 'José Peña' becomes 'Jose Pena'."""
    out = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().strip()
    return out or "unknown"

def safe_next(n: str) -> str:
    """Only allow same-site relative redirects."""
    if n and n.startswith("/") and not n.startswith("//") and "\\" not in n:
        return n
    return "/"

def normalize_role(role: str | None) -> str:
    role = (role or "").strip().lower()
    return role if role in ROLES else DEFAULT_ROLE

def role_for_path(path: str) -> str | None:
    """Return the role that owns a frontend folder, if the path is in one."""
    for role in ROLES:
        if path == f"/{role}" or path.startswith(f"/{role}/"):
            return role
    return None

APP1_HISTORY_RE = re.compile(
    r"^/app1/employees/([1-9][0-9]*)/violation-history$")
APP1_ISSUE_RE = re.compile(r"^/app1/employees/[1-9][0-9]*/violations$")
APP1_PRIVATE_READ_RE = re.compile(
    r"^/app1/(?:activity|analytics|violation-removals)(?:/|$)")


def app1_allowed(role: str, employee_id: int | None, method: str,
                 path: str) -> bool:
    """Server-side enforcement of the app1 part of the role matrix."""
    if not path.startswith("/app1/"):
        return True
    if role == "hr":
        return True
    if role == "employee":
        match = APP1_HISTORY_RE.fullmatch(path)
        return (method == "GET" and match is not None
                and employee_id is not None
                and int(match.group(1)) == employee_id)
    if role == "supervisor":
        if method == "GET":
            return APP1_PRIVATE_READ_RE.match(path) is None
        return method == "POST" and APP1_ISSUE_RE.fullmatch(path) is not None
    if role == "c_manager":
        return method == "GET"
    return False

def role_home(role: str) -> str:
    return ROLE_HOME[normalize_role(role)]

def load_login_html() -> str:
    """Read login.html, cached but refreshed when the file changes."""
    m = LOGIN_HTML_PATH.stat().st_mtime          # raises if missing
    if _login_cache["mtime"] != m:
        _login_cache.update(mtime=m,
                            html=LOGIN_HTML_PATH.read_text(encoding="utf-8"))
    return _login_cache["html"]

_SIGNIN_ERROR_RE = re.compile(r'<p\b[^>]*\bid="signin-error"[^>]*>.*?</p>', re.S)
_SIGNIN_NEXT_RE  = re.compile(r'(<input\b[^>]*\bid="signin-next"[^>]*\bvalue=")[^"]*(")')

def render_login(next_url: str, error: str = "") -> str:
    page = load_login_html()
    if error:
        # swap the empty hidden <p id="signin-error"> for a visible one
        err = (f'<p id="signin-error" class="signin-error" role="alert" '
               f'tabindex="-1">{html.escape(error)}</p>')
        page = _SIGNIN_ERROR_RE.sub(err, page, count=1)
    # keep the originally requested destination in the hidden field
    page = _SIGNIN_NEXT_RE.sub(
        lambda m: m.group(1) + html.escape(next_url, quote=True) + m.group(2),
        page, count=1)
    return page

# ---------- app ----------
auth_app = FastAPI(title="Auth", docs_url=None, redoc_url=None, openapi_url=None)


@auth_app.get("/login", response_class=HTMLResponse)
def login_page(next: str = "/"):
    return render_login(safe_next(next))


@auth_app.post("/login")
def login(username: str = Form(...), password: str = Form(...),
          next_url: str = Form("/", alias="next")):
    with closing(db()) as c, c:
        row = c.execute(
            "SELECT id, password_hash, role FROM users "
            "WHERE username=? AND disabled=0",
            (username.strip(),)).fetchone()
        ok = check_password(password, row["password_hash"] if row else DUMMY_HASH)
        if not (row and ok):
            return HTMLResponse(render_login(next_url, "Wrong username or password."),
                                status_code=401)
        role = normalize_role(row["role"])
        token = secrets.token_urlsafe(32)
        now = int(time.time())
        c.execute("DELETE FROM sessions WHERE expires_at < ?", (now,))
        c.execute("INSERT INTO sessions VALUES (?,?,?)",
                  (hash_token(token), row["id"], now + SESSION_TTL))
    target = safe_next(next_url)
    wanted = role_for_path(target.split("?", 1)[0].split("#", 1)[0])
    if target in ("/", "/index.html") or (wanted and wanted != role):
        target = role_home(role)
    resp = RedirectResponse(target, status_code=303)
    resp.set_cookie(COOKIE, token, max_age=SESSION_TTL, httponly=True,
                    secure=COOKIE_SECURE, samesite="lax", path="/")
    return resp


@auth_app.api_route("/logout", methods=["GET", "POST"])
def logout(request: Request):
    token = request.cookies.get(COOKIE)
    if token:
        with closing(db()) as c, c:
            c.execute("DELETE FROM sessions WHERE token_hash=?", (hash_token(token),))
    resp = RedirectResponse(f"{PREFIX}/login", status_code=303)
    resp.delete_cookie(COOKIE, path="/")
    return resp


@auth_app.get("/verify")
def verify(request: Request):
    """Called by nginx (auth_request) before every protected request."""
    method = request.headers.get("x-original-method", "").upper()
    path = request.headers.get("x-original-uri", "").split("?")[0]
    normalized = request.headers.get("x-normalized-uri", path).split("?")[0]
    device_only = (
        method == DEVICE_ALLOWED_METHOD and path.startswith(DEVICE_ALLOWED_PREFIX)
    )
    now = int(time.time())
    with closing(db()) as c:
        token = request.cookies.get(COOKIE)
        if token and not device_only:
            row = c.execute(
                "SELECT u.username, u.first_name, u.last_name, u.role, "
                "u.employee_id "
                "FROM sessions s JOIN users u ON u.id=s.user_id "
                "WHERE s.token_hash=? AND s.expires_at>? AND u.disabled=0",
                (hash_token(token), now)).fetchone()
            if row:
                role = normalize_role(row["role"])
                wanted = role_for_path(normalized)
                if wanted and wanted != role:
                    return Response(status_code=403)
                if not app1_allowed(role, row["employee_id"], method, path):
                    return Response(status_code=403)
                headers = {
                    "X-User": header_safe(full_name(row)),
                    "X-Username": row["username"],
                    "X-Role": role,
                }
                if row["employee_id"] is not None:
                    headers["X-Employee-Id"] = str(row["employee_id"])
                return Response(status_code=200, headers=headers)

        bearer = request.headers.get("authorization", "")
        if bearer.lower().startswith("bearer "):
            dev = c.execute(
                "SELECT d.id, d.name, d.last_used FROM devices d "
                "LEFT JOIN trackers t ON t.id = d.tracker_id "
                "WHERE d.token_hash=? AND d.revoked=0 "
                "AND (d.expires_at IS NULL OR d.expires_at>?) "
                "AND (d.tracker_id IS NULL OR t.disabled=0)",
                (hash_token(bearer[7:].strip()), now)).fetchone()
            allowed = (method, path) in DEVICE_ALLOWED or (method == 'PATCH' and re.fullmatch(r'/app2/mobile-photos/[1-9][0-9]*/title', path) is not None)
            if dev and allowed:
                if now - (dev["last_used"] or 0) > RENEW_AFTER:
                    with c:
                        c.execute("UPDATE devices SET last_used=?, expires_at=? WHERE id=?",
                                  (now, now + DEVICE_TTL, dev["id"]))
                return Response(status_code=200, headers={"X-Device": dev["name"]})    
    return Response(status_code=401)


# mob device part

class TrackerLogin(BaseModel):
    username: str
    password: str
    device_id: str


@auth_app.post("/device-login")
def device_login(body: TrackerLogin):
    with closing(db()) as c, c:
        row = c.execute(
            "SELECT id, password_hash FROM trackers WHERE username=? AND disabled=0",
            (body.username.strip(),)).fetchone()
        ok = check_password(body.password, row["password_hash"] if row else DUMMY_HASH)
        if not (row and ok):
            return JSONResponse({"detail": "Wrong username or password."}, status_code=401)
        token = secrets.token_urlsafe(32)
        now = int(time.time())
        name = f"{body.username.strip()}:{body.device_id[:64]}"
        c.execute("DELETE FROM devices WHERE name=?", (name,))  # one token per tracker+phone
        c.execute(
            "INSERT INTO devices(name,token_hash,created_at,tracker_id,expires_at,last_used) "
            "VALUES(?,?,?,?,?,?)",
            (name, hash_token(token), now, row["id"], now + DEVICE_TTL, now))
    return {"token": token, "expires_at": now + DEVICE_TTL}


@auth_app.post("/device-logout")
def device_logout(request: Request):
    bearer = request.headers.get("authorization", "")
    if bearer.lower().startswith("bearer "):
        with closing(db()) as c, c:
            c.execute("UPDATE devices SET revoked=1 WHERE token_hash=?",
                      (hash_token(bearer[7:].strip()),))
    return {"status": "ok"}

@auth_app.get("/me")
def me(request: Request):
    token = request.cookies.get(COOKIE)
    if token:
        with closing(db()) as c:
            row = c.execute(
                "SELECT u.id, u.username, u.first_name, u.last_name, u.role, "
                "u.employee_id, u.employee_code "
                "FROM sessions s JOIN users u ON u.id=s.user_id "
                "WHERE s.token_hash=? AND s.expires_at>? AND u.disabled=0",
                (hash_token(token), int(time.time()))).fetchone()
        if row:
            role = normalize_role(row["role"])
            return JSONResponse(
                {"id": row["id"], "username": row["username"],
                 "first_name": row["first_name"], "last_name": row["last_name"],
                 "full_name": full_name(row), "role": role,
                 "employee_id": row["employee_id"],
                 "employee_code": row["employee_code"],
                 "role_home": role_home(role)},
                headers={"Cache-Control": "no-store"})
    return JSONResponse({"detail": "Not signed in"}, status_code=401)

# Additive migration: old trackers keep GPS access until HR links them.
with closing(db()) as _c, _c:
    _cols = {r['name'] for r in _c.execute('PRAGMA table_info(trackers)')}
    for _name, _type in [('employee_id', 'INTEGER'), ('employee_code', 'TEXT')]:
        if _name not in _cols:
            _c.execute(f'ALTER TABLE trackers ADD COLUMN {_name} {_type}')
    _c.execute('CREATE UNIQUE INDEX IF NOT EXISTS ux_tracker_employee ON trackers(employee_id) WHERE employee_id IS NOT NULL')

from auth.mobile_access import router as mobile_access_router
auth_app.include_router(mobile_access_router)
