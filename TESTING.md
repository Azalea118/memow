# Testing

The suite is plain `pytest` with two markers declared in [pytest.ini](pytest.ini):

| Marker | Meaning | Default |
|---|---|---|
| `system` | needs Docker; exercises the real nginx config with stub services | skipped by CI |
| `slow` | long end-to-end checks | currently unused |

There are no `xfail` markers. A failing test means the code or the test needs to be fixed, not marked as expected failure.

## Commands

```bash
# install dev dependencies once
uv sync --frozen --dev

# same selection CI runs
uv run pytest -m "not system" -v

# everything, including the Docker-backed nginx gate tests
uv run pytest -q

# only the system tests
uv run pytest -m system -v
```

CI runs `uv python install 3.12`, `uv sync --frozen --dev`, then `uv run pytest -m "not system" -v` on every push and pull request ([tests.yml](.github/workflows/tests.yml)). The system tests start `tests/nginx/docker-compose.test.yaml` on port `8091` and tear it down afterwards; Docker must be available.

## Layout

| Path | Covers |
|---|---|
| `tests/unit/` | pure helper functions |
| `tests/test_auth.py` | auth helpers and session/token behavior |
| `tests/test_app1*.py` | employee, rulebook, violation, filter, activity, analytics APIs |
| `tests/test_pt_service*.py` | photo upload, library, history, activity, validation |
| `tests/test_gps_service*.py` | GPS ingest, smoothing, live state, routes |
| `tests/test_safety_canary.py` | shared safety checks |
| `tests/test_nginx_gate.py` | real nginx routing/auth gate (`system`) |
| `tests/nginx/stub/` | stub auth/app services used by the system test |

## Test isolation

[tests/conftest.py](tests/conftest.py) redirects every SQLite engine into a temporary directory **before** service modules are imported, so tests never touch the real databases in `data/`. It wipes relevant tables per test and points `PT_UPLOAD_DIR` at `tmp_path`.

Because of that import-time patch, test modules must not import service modules at module top level. Import inside a test or fixture:

```python
def test_something(pt_client):
    from pt_service import main as pt_main
    ...
```

Shared fixtures:

- `auth_client`, `auth_user` — auth service
- `app1_client` — violation tracker
- `pt_client` — photo service with isolated uploads
- `mobile_upload` — uploads through `POST /mobile-upload` with a stubbed employee identity
- `gps_client` — GPS service
- `actor_headers` — `X-Actor: test-actor` for browser-style writes

## Writing a new test

- Match the file to the service (`test_app1*.py`, `test_pt_service*.py`, etc.).
- Use the existing fixtures instead of pointing services at real `data/` paths.
- Assert the current behavior of the API; do not reintroduce `xfail` for known gaps.
- If a bug is found, fix the code and keep a regression test that would have caught it.

`tests/TEST_CASES.md` is a generated historical snapshot, not a maintained test inventory. Use `pytest --collect-only -q` when you need the current list.
