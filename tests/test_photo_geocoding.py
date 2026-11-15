import importlib.util
import json
from pathlib import Path
import sqlite3

import pytest

spec = importlib.util.spec_from_file_location('places', Path(__file__).parents[1] / 'geocoding/worker.py')
g = importlib.util.module_from_spec(spec)
spec.loader.exec_module(g)


def database():
    db = sqlite3.connect(':memory:')
    db.execute('CREATE TABLE photo_records (id INTEGER PRIMARY KEY, mobile_metadata TEXT, location_name TEXT, title TEXT, timestamp TEXT)')
    g.initialize(db)
    return db


def add(db, i=1, **meta):
    raw = json.dumps({'latitude': 8.478599, 'longitude': 124.667777, 'source': 'gallery', 'selected_at': '2026-11-13T00:00:00Z', **meta})
    with db:
        db.execute('INSERT INTO photo_records VALUES (?,?,NULL,?,?)', (i, raw, 'Gate 2', 'original time'))
    return raw


def run(db, lookup=lambda *_: 'Lapasan, Cagayan de Oro', now=100):
    return g.run_batch(db, lookup=lookup, now=now, pause=lambda _: None)


def test_backfill_and_new_upload_preserve_metadata_and_title():
    db = database()
    raw = add(db)
    assert run(db) == (1, 1)
    assert db.execute('SELECT * FROM photo_records').fetchone() == (1, raw, 'Lapasan, Cagayan de Oro', 'Gate 2', 'original time')
    add(db, 2, source='camera')
    assert run(db, lookup=lambda *_: pytest.fail('same coordinates must use cache')) == (1, 1)


def test_failure_retains_photo_and_retries_later():
    db = database()
    add(db)
    def fail(*_):
        raise TimeoutError()
    assert run(db, fail) == (1, 0)
    assert run(db, now=110) == (0, 0)
    assert run(db, now=131) == (1, 1)
    assert db.execute('SELECT count(*) FROM photo_records').fetchone()[0] == 1


def test_restart_keeps_retry_and_success(tmp_path):
    path = tmp_path / 'photos.db'
    db = database()
    add(db)
    with sqlite3.connect(path) as target:
        db.backup(target)
    db.close()
    with g.connect(path) as db:
        assert run(db, lookup=lambda *_: None) == (1, 0)
    with g.connect(path) as db:
        assert run(db, now=200) == (0, 0)
        assert run(db, now=86501) == (1, 1)


def test_invalid_and_outside_coverage_not_sent():
    db = database()
    add(db, latitude=90)
    add(db, 2, latitude=None)
    assert run(db, lookup=lambda *_: pytest.fail('invalid/outside coordinate sent')) == (2, 0)


def test_never_replace_existing_label():
    db = database()
    add(db)
    db.execute("UPDATE photo_records SET location_name='Reviewed location'")
    db.commit()
    assert run(db) == (0, 0)


def test_metadata_changed_during_lookup_is_not_overwritten():
    db = database()
    add(db)
    def changed(*_):
        with db:
            db.execute("UPDATE photo_records SET mobile_metadata='{}'")
        return 'Old position'
    assert run(db, changed) == (1, 0)
    assert db.execute('SELECT location_name FROM photo_records').fetchone()[0] is None


def test_label_deduplicates_and_does_not_guess():
    assert g.place_label({'address': {'road': 'Gate Road', 'suburb': 'Lapasan', 'city': 'Cagayan de Oro', 'state': 'Cagayan de Oro'}}) == 'Gate Road, Lapasan, Cagayan de Oro'
    assert g.place_label({'error': 'Unable to geocode'}) is None
    assert g.place_label({'display_name': 'unstructured output'}) is None


@pytest.mark.parametrize('url', ['https://nominatim.openstreetmap.org', 'http://example.com', 'http://user:pass@nominatim', 'http://8.8.8.8'])
def test_public_or_credential_url_rejected(url):
    with pytest.raises(ValueError):
        g.validate_url(url)


def test_no_accidental_database_creation(tmp_path):
    path = tmp_path / 'missing.db'
    with pytest.raises(sqlite3.OperationalError):
        g.connect(path)
    assert not path.exists()
