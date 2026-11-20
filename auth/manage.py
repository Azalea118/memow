import argparse, getpass, secrets, time
from contextlib import closing

from auth.main import db, hash_password, hash_token, ROLES, DEFAULT_ROLE


def valid_role(role):
    role = (role or "").strip().lower()
    if role not in ROLES:
        raise SystemExit(f"Role must be one of: {', '.join(ROLES)}.")
    return role


def prompt_role():
    print("Roles:", ", ".join(ROLES))
    role = input(f"Role [{DEFAULT_ROLE}]: ").strip() or DEFAULT_ROLE
    return valid_role(role)


def create_user(a):
    first = input("First name: ").strip()
    last = input("Last name: ").strip()
    if not first or not last:
        raise SystemExit("First and last name are required.")
    role = valid_role(a.role) if a.role else prompt_role()
    pw = getpass.getpass("Password: ")
    if len(pw) < 10 or pw != getpass.getpass("Again: "):
        raise SystemExit("Passwords differ or are shorter than 10 characters.")
    with closing(db()) as c, c:
        c.execute(
            "INSERT INTO users(username,password_hash,first_name,last_name,created_at,role) "
            "VALUES(?,?,?,?,?,?) ON CONFLICT(username) DO UPDATE SET "
            "password_hash=excluded.password_hash, first_name=excluded.first_name, "
            "last_name=excluded.last_name, role=excluded.role",
            (a.name, hash_password(pw), first, last, int(time.time()), role))
        c.execute("DELETE FROM sessions WHERE user_id=(SELECT id FROM users WHERE username=?)",
                  (a.name,))
    print(f"User '{a.name}' saved as {first} {last} ({role}).")

def set_role(a):
    role = valid_role(a.role)
    with closing(db()) as c, c:
        cur = c.execute("UPDATE users SET role=? WHERE username=?", (role, a.name))
    print(f"Role updated to {role}." if cur.rowcount else f"No user '{a.name}'.")


def set_name(a):
    """Change the name only, keeping the password and sessions."""
    first = input("First name: ").strip()
    last = input("Last name: ").strip()
    if not first or not last:
        raise SystemExit("First and last name are required.")
    with closing(db()) as c, c:
        cur = c.execute("UPDATE users SET first_name=?, last_name=? WHERE username=?",
                        (first, last, a.name))
    print("Updated." if cur.rowcount else f"No user '{a.name}'.")

def add_device(a):
    token = secrets.token_urlsafe(32)
    with closing(db()) as c, c:
        c.execute("INSERT INTO devices(name,token_hash,created_at) VALUES(?,?,?)",
                  (a.name, hash_token(token), int(time.time())))
    print(f"Token for '{a.name}' (shown once, copy it now):\n{token}")


def revoke_device(a):
    with closing(db()) as c, c:
        c.execute("UPDATE devices SET revoked=1 WHERE name=?", (a.name,))
    print(f"Device '{a.name}' revoked.")


def list_all(a):
    with closing(db()) as c:
        for r in c.execute("SELECT username, first_name, last_name, role FROM users"):
            name = f"{r['first_name'] or ''} {r['last_name'] or ''}".strip()
            print("User:", r["username"], f"({name})" if name else "(no name set)",
                  f"[{r['role']}]")
        for r in c.execute("SELECT username, disabled FROM trackers"):
            print("Tracker:", r["username"], "(disabled)" if r["disabled"] else "(active)")
        for r in c.execute("SELECT name, revoked FROM devices"):
            print("Device:", r["name"], "(revoked)" if r["revoked"] else "(active)")

def create_tracker(a):
    pw = getpass.getpass("Password: ")
    if len(pw) < 8 or pw != getpass.getpass("Again: "):
        raise SystemExit("Passwords differ or are shorter than 8 characters.")
    with closing(db()) as c, c:
        c.execute(
            "INSERT INTO trackers(username,password_hash,created_at) VALUES(?,?,?) "
            "ON CONFLICT(username) DO UPDATE SET password_hash=excluded.password_hash, disabled=0",
            (a.name, hash_password(pw), int(time.time())))
        # a password change logs the phone out
        c.execute("UPDATE devices SET revoked=1 WHERE tracker_id="
                  "(SELECT id FROM trackers WHERE username=?)", (a.name,))
    print(f"Tracker '{a.name}' saved.")


def disable_tracker(a):
    with closing(db()) as c, c:
        c.execute("UPDATE trackers SET disabled=1 WHERE username=?", (a.name,))
        c.execute("UPDATE devices SET revoked=1 WHERE tracker_id="
                  "(SELECT id FROM trackers WHERE username=?)", (a.name,))
    print(f"Tracker '{a.name}' disabled and its phones logged out.")


p = argparse.ArgumentParser()
s = p.add_subparsers(required=True)
for cmd, fn in [("create-user", create_user), ("add-device", add_device),
                ("revoke-device", revoke_device),
                ("create-tracker", create_tracker),
                ("set-name", set_name),
                ("set-role", set_role),
                ("disable-tracker", disable_tracker)]:
    sp = s.add_parser(cmd); sp.add_argument("name")
    if fn is create_user:
        sp.add_argument("--role", choices=ROLES,
                        help="account role; prompts when omitted")
    elif fn is set_role:
        sp.add_argument("--role", choices=ROLES, required=True)
    sp.set_defaults(fn=fn)
s.add_parser("list").set_defaults(fn=list_all)
a = p.parse_args(); a.fn(a)
