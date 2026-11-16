"""Browser-managed tracker access and server-resolved employee identity.

SQLite files remain separate. The auth database owns the unique employee link;
only a read-only connection is used to look up HR records.
"""
import os
import sqlite3
import time
from contextlib import closing
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field

router = APIRouter()


def auth():
    from auth import main
    return main


def employee(employee_id: int, *, active=False):
    path = Path(os.getenv('APP1_DB_PATH', Path(__file__).resolve().parents[1] / 'data/app1/app.db')).resolve()
    try:
        with closing(sqlite3.connect(path.as_uri() + '?mode=ro', uri=True)) as c:
            c.row_factory = sqlite3.Row
            row = c.execute('SELECT id, employee_code, first_name, last_name, status FROM employees WHERE id=?', (employee_id,)).fetchone()
    except sqlite3.Error:
        raise HTTPException(503, 'Employee records are temporarily unavailable. Please try again.')
    if not row:
        raise HTTPException(404, 'This employee no longer exists. Refresh the employee list.')
    if active and row['status'] != 'active':
        raise HTTPException(403, 'This employee is inactive. Ask HR to reactivate the employee profile first.')
    return {'employee_id': row['id'], 'employee_code': row['employee_code'],
            'full_name': f"{row['first_name']} {row['last_name']}", 'status': row['status']}


def browser_user(request: Request):
    a = auth()
    with closing(a.db()) as c:
        row = c.execute('SELECT u.id, u.username FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?',
                        (a.hash_token(request.cookies.get(a.COOKIE, '')), int(time.time()))).fetchone()
    if not row:
        raise HTTPException(401, 'Please sign in to the HR website again.')
    # Custom header + JSON prevents cross-origin form submissions; no CORS grant.
    if request.method != 'GET' and request.headers.get('x-requested-with') != 'Northpoint':
        raise HTTPException(403, 'Please use Mobile App Access on the HR website.')
    return dict(row)


def tracker_identity(request: Request):
    a = auth()
    bearer = request.headers.get('authorization', '')
    if not bearer.lower().startswith('bearer '):
        raise HTTPException(401, 'Please sign in to the mobile app again.')
    now = int(time.time())
    with closing(a.db()) as c, c:
        row = c.execute('''SELECT d.id, t.id AS tracker_id, t.username, t.employee_id,
                   t.employee_code FROM devices d JOIN trackers t ON t.id=d.tracker_id
                   WHERE d.token_hash=? AND d.revoked=0 AND t.disabled=0
                   AND (d.expires_at IS NULL OR d.expires_at>?)''',
                   (a.hash_token(bearer[7:].strip()), now)).fetchone()
        if not row:
            raise HTTPException(401, 'Your mobile session has expired or was disabled. Please sign in again.')
        if not row['employee_id']:
            raise HTTPException(403, 'Your account is not linked to an employee. Ask HR to open Mobile App Access.')
        info = employee(row['employee_id'], active=True)
        if info['employee_code'] != row['employee_code']:
            raise HTTPException(403, 'The employee record has changed. Ask HR to check your mobile access.')
        c.execute('UPDATE devices SET last_used=?, expires_at=? WHERE id=?', (now, now+a.DEVICE_TTL, row['id']))
    return {**info, 'tracker_id': row['tracker_id'], 'username': row['username']}


class AccountCreate(BaseModel):
    model_config = ConfigDict(extra='forbid')
    username: str = Field(min_length=3, max_length=50, pattern=r'^[A-Za-z0-9][A-Za-z0-9._-]+$')
    password: str = Field(min_length=10, max_length=128)


class AccountChange(BaseModel):
    model_config = ConfigDict(extra='forbid')
    password: str | None = Field(default=None, min_length=10, max_length=128)
    disabled: bool | None = None


@router.get('/device-me')
def device_me(response: Response, info=Depends(tracker_identity)):
    response.headers['Cache-Control'] = 'no-store'
    return info


@router.get('/employees/{employee_id}/mobile-access')
def access_status(employee_id: int, response: Response, user=Depends(browser_user)):
    info = employee(employee_id)
    response.headers['Cache-Control'] = 'no-store'
    with closing(auth().db()) as c:
        row = c.execute('SELECT username, disabled FROM trackers WHERE employee_id=?', (employee_id,)).fetchone()
    return {**info, 'account': dict(row) if row else None}


@router.post('/employees/{employee_id}/mobile-access', status_code=201)
def create_access(employee_id: int, body: AccountCreate, response: Response, user=Depends(browser_user)):
    info = employee(employee_id, active=True)
    a = auth()
    try:
        with closing(a.db()) as c, c:
            c.execute('INSERT INTO trackers(username,password_hash,created_at,employee_id,employee_code) VALUES(?,?,?,?,?)',
                      (body.username, a.hash_password(body.password), int(time.time()), employee_id, info['employee_code']))
    except sqlite3.IntegrityError:
        raise HTTPException(409, 'This username or employee already has a mobile account. Refresh Mobile App Access or choose another username.')
    response.headers['Cache-Control'] = 'no-store'
    return {**info, 'account': {'username': body.username, 'disabled': False},
            'message': f"Mobile account created for {info['full_name']}. The employee can now sign in."}


@router.post('/employees/{employee_id}/mobile-access/link')
def link_existing(employee_id: int, body: AccountCreate, response: Response, user=Depends(browser_user)):
    """HR may explicitly claim an unlinked legacy tracker and reset its password."""
    info = employee(employee_id, active=True)
    a = auth()
    try:
        with closing(a.db()) as c, c:
            c.execute('BEGIN IMMEDIATE')
            row = c.execute('SELECT id, employee_id FROM trackers WHERE username=?', (body.username,)).fetchone()
            if not row:
                raise HTTPException(404, 'That mobile username does not exist. Use Create Mobile Account instead.')
            if row['employee_id'] is not None:
                raise HTTPException(409, 'That account is already linked. Open the linked employee profile instead.')
            c.execute('UPDATE trackers SET employee_id=?, employee_code=?, password_hash=?, disabled=0 WHERE id=?',
                      (employee_id, info['employee_code'], a.hash_password(body.password), row['id']))
            c.execute('UPDATE devices SET revoked=1 WHERE tracker_id=?', (row['id'],))
    except sqlite3.IntegrityError:
        raise HTTPException(409, 'This employee already has a mobile account. Refresh this section.')
    response.headers['Cache-Control'] = 'no-store'
    return {'message': 'Existing account linked and password reset. Ask the employee to sign in again.'}


@router.patch('/employees/{employee_id}/mobile-access')
def change_access(employee_id: int, body: AccountChange, user=Depends(browser_user)):
    employee(employee_id, active=body.disabled is False)
    if body.password is None and body.disabled is None:
        raise HTTPException(422, 'Enter a new password or choose an access status.')
    a = auth()
    with closing(a.db()) as c, c:
        row = c.execute('SELECT id FROM trackers WHERE employee_id=?', (employee_id,)).fetchone()
        if not row:
            raise HTTPException(404, 'Create a mobile account for this employee first.')
        if body.password is not None:
            c.execute('UPDATE trackers SET password_hash=? WHERE id=?', (a.hash_password(body.password), row['id']))
        if body.disabled is not None:
            c.execute('UPDATE trackers SET disabled=? WHERE id=?', (int(body.disabled), row['id']))
        if body.password is not None or body.disabled:
            c.execute('UPDATE devices SET revoked=1 WHERE tracker_id=?', (row['id'],))
    return {'message': 'Mobile access updated. Password changes or disabling access sign out existing phones.'}
