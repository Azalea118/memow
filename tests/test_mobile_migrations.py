import os
import sqlite3
import subprocess
import sys
from pathlib import Path


def test_existing_databases_upgrade_without_losing_accounts_or_photos(tmp_path):
    auth=tmp_path/'auth.db';photos=tmp_path/'photos.db'
    with sqlite3.connect(auth) as c:
        c.execute('CREATE TABLE trackers(id INTEGER PRIMARY KEY,username TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,disabled INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL)')
        c.execute("INSERT INTO trackers VALUES(1,'legacy','existing-password-hash',0,100)")
    with sqlite3.connect(photos) as c:
        c.execute('CREATE TABLE photo_records(id INTEGER PRIMARY KEY,owner_name VARCHAR NOT NULL,filepath VARCHAR NOT NULL,timestamp DATETIME)')
        c.execute("INSERT INTO photo_records VALUES(1,'Original uploader','uploads/original.jpg','2026-01-01 09:00:00')")
    env={**os.environ,'AUTH_DB_PATH':str(auth),'PT_DB_PATH':str(photos),'PT_UPLOAD_DIR':str(tmp_path/'uploads')}
    script='''
from auth import main as auth
from pt_service import main as photos
with auth.db() as c:
 row=c.execute('SELECT * FROM trackers WHERE id=1').fetchone()
 assert row['username']=='legacy' and row['password_hash']=='existing-password-hash'
 assert row['employee_id'] is None
with photos.SessionLocal() as s:
 row=s.get(photos.PhotoRecord,1)
 assert row.owner_name=='Original uploader' and row.mobile_metadata is None
'''
    for _ in range(2):
        subprocess.run([sys.executable,'-c',script],env=env,cwd=Path(__file__).resolve().parents[1],check=True,capture_output=True,text=True)
