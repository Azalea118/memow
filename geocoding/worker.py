"""Optional local-only enrichment. No imports or changes to the upload service."""
import argparse
from contextlib import closing
import ipaddress
import json
import logging
import math
import os
from pathlib import Path
import sqlite3
import time
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler, ProxyHandler

LOG = logging.getLogger('photo-places')
DB_PATH = os.getenv('PT_DB_PATH', '/data/photos.db')
BASE_URL = os.getenv('GEOCODER_URL', 'http://nominatim:8080')
BOUNDS = (123.8, 7.0, 126.0, 9.1)  # same buffered extract as prepare-map.sh


def validate_url(url):
    p = urlsplit(url)
    try:
        local = ipaddress.ip_address(p.hostname or '').is_private
    except ValueError:
        local = p.hostname in {'nominatim', 'localhost', 'host.docker.internal'}
    if p.scheme not in {'http', 'https'} or not local or p.username or p.password or p.query or p.fragment:
        raise ValueError('Use the configured local Nominatim server; public providers are disabled.')
    return url.rstrip('/')


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError('Geocoder redirects are disabled')


def place_label(body):
    if not isinstance(body, dict) or body.get('error'):
        return None
    address = body.get('address')
    if not isinstance(address, dict):
        return None
    groups = [('building', 'amenity', 'tourism', 'leisure'),
              ('road', 'pedestrian', 'footway', 'path'),
              ('suburb', 'quarter', 'neighbourhood', 'village'),
              ('city', 'town', 'municipality'), ('state',)]
    parts = []
    for group in groups:
        for key in group:
            value = address.get(key)
            if isinstance(value, str) and value.strip():
                value = ' '.join(value.split())
                if value.casefold() not in {s.casefold() for s in parts}:
                    parts.append(value)
                break
    return ', '.join(parts)[:400] or None


def reverse(latitude, longitude):
    base = validate_url(BASE_URL)
    query = urlencode({'format': 'jsonv2', 'lat': latitude, 'lon': longitude,
                       'addressdetails': 1, 'zoom': 18, 'accept-language': 'en'})
    req = Request(base + '/reverse?' + query, headers={
        'User-Agent': 'NorthpointPhotoPlaces/1.0 (private self-hosted service)',
        'Accept': 'application/json'})
    # No OS HTTP proxy or redirects: saved employee GPS stays on the local service.
    opener = build_opener(ProxyHandler({}), NoRedirect())
    with opener.open(req, timeout=3) as response:
        raw = response.read(65537)
        if len(raw) > 65536:
            raise ValueError('Oversized response')
        return place_label(json.loads(raw))


def connect(path=DB_PATH):
    # mode=rw avoids silently creating a new, wrong database when a mount is wrong.
    db = sqlite3.connect(Path(path).resolve().as_uri() + '?mode=rw', uri=True, timeout=2)
    columns = {r[1] for r in db.execute('PRAGMA table_info(photo_records)')}
    if not {'id', 'mobile_metadata', 'location_name'}.issubset(columns):
        db.close()
        raise RuntimeError('Install the Photo Titles backend update first.')
    return db


def initialize(db):
    with db:
        db.execute('''CREATE TABLE IF NOT EXISTS photo_geocode_jobs (
            photo_id INTEGER PRIMARY KEY, metadata TEXT NOT NULL,
            attempts INTEGER NOT NULL, next_at REAL NOT NULL)''')
        db.execute('''CREATE TABLE IF NOT EXISTS photo_geocode_cache (
            coordinate_key TEXT PRIMARY KEY, label TEXT NOT NULL)''')


def coordinates(raw):
    meta = json.loads(raw)
    if not isinstance(meta, dict):
        raise ValueError('Invalid metadata')
    lat, lon = meta.get('latitude'), meta.get('longitude')
    if any(isinstance(x, bool) or not isinstance(x, (int, float)) or not math.isfinite(x) for x in (lat, lon)):
        raise ValueError('Invalid coordinates')
    if not (BOUNDS[1] <= lat <= BOUNDS[3] and BOUNDS[0] <= lon <= BOUNDS[2]):
        raise ValueError('Outside regional coverage')
    return lat, lon


def run_batch(db, lookup=reverse, now=None, pause=time.sleep):
    now = time.time() if now is None else now
    rows = db.execute('''SELECT p.id, p.mobile_metadata, COALESCE(j.attempts,0)
        FROM photo_records p LEFT JOIN photo_geocode_jobs j ON j.photo_id=p.id
        WHERE (p.location_name IS NULL OR trim(p.location_name)='')
        AND p.mobile_metadata IS NOT NULL
        AND (j.photo_id IS NULL OR j.metadata != p.mobile_metadata OR j.next_at <= ?)
        ORDER BY p.id LIMIT 50''', (now,)).fetchall()
    resolved = 0
    for photo_id, raw, attempts in rows:
        label = None
        delay = 86400
        key = None
        try:
            lat, lon = coordinates(raw)
            key = json.dumps([lat, lon], separators=(',', ':'))
            cached = db.execute('SELECT label FROM photo_geocode_cache WHERE coordinate_key=?', (key,)).fetchone()
            if cached:
                label = cached[0]
            else:
                try:
                    label = lookup(lat, lon)
                    delay = 86400 if not label else 0
                except Exception:
                    # Do not log URLs, coordinates, names, or provider response bodies.
                    delay = min(3600, 30 * 2 ** min(attempts, 7))
                finally:
                    pause(1.1)
        except (ValueError, TypeError):
            pass
        # HTTP finished before beginning this brief write transaction.
        with db:
            if label:
                if not isinstance(label, str) or len(label) > 400:
                    raise ValueError('Invalid label')
                db.execute('INSERT OR REPLACE INTO photo_geocode_cache VALUES (?,?)', (key, label))
                cursor = db.execute('''UPDATE photo_records SET location_name=?
                    WHERE id=? AND mobile_metadata=? AND (location_name IS NULL OR trim(location_name)='')''',
                                    (label, photo_id, raw))
                resolved += cursor.rowcount
                db.execute('DELETE FROM photo_geocode_jobs WHERE photo_id=?', (photo_id,))
            else:
                db.execute('INSERT OR REPLACE INTO photo_geocode_jobs VALUES (?,?,?,?)',
                           (photo_id, raw, attempts + 1, now + delay))
    return len(rows), resolved


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--once', action='store_true')
    parser.add_argument('--backup', help='SQLite-consistent backup before first run; will not overwrite')
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format='%(message)s')
    if args.backup:
        target = Path(args.backup)
        # Reserve exclusively before sqlite opens it.
        with target.open('xb'):
            pass
        try:
            with closing(connect()) as source, closing(sqlite3.connect(target)) as dest:
                source.backup(dest)
        except Exception:
            target.unlink(missing_ok=True)
            raise
        LOG.info('Photo database backup completed.')
        return
    validate_url(BASE_URL)
    while True:
        try:
            with closing(connect()) as db:
                initialize(db)
                count, resolved = run_batch(db)
            LOG.info('Place lookup: checked=%s resolved=%s', count, resolved)
        except Exception as exc:
            LOG.warning('Place lookup paused (%s). Upload service is independent.', type(exc).__name__)
            if args.once:
                raise
        if args.once:
            return
        time.sleep(15)


if __name__ == '__main__':
    main()
