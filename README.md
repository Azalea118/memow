![tests](https://github.com/jooecoodes/cs317-swe/actions/workflows/tests.yml/badge.svg)

# Northpoint backend

Backend for an internal HR and tracking web app. One Docker Compose stack serves the Northpoint UI, a violation tracker, an employee photo library, GPS ingest, and the auth gate in front of all of them.

Browser users sign in with a session cookie. Android devices sign in with a device token. nginx checks every request through the auth service before it reaches an app.

## What the app does

| Area | Public path | Responsibility |
|---|---|---|
| Northpoint UI | `/` | HR dashboard, employees, rulebook, photos, reports, map |
| app1 — violation tracker | `/app1/` | Employees, rulebook categories/subsections/penalties, issuing and removing violations, audit history, analytics |
| app2 — photo library | `/app2/` | Employee photo uploads with GPS context, browsing/editing files, activity and stats |
| app3 — GPS tracking | `/app3/` | Phone GPS batches, live device state, daily routes, map |
| auth | `/auth/` | Login, device login, `auth_request` verification, employee↔tracker links |

There is no separate `frontend` Compose service: the static UI lives in `frontend/northpoint/` and is served by nginx. The Python services are internal on port `8000`. Locally nginx is published on `8081`; in production Caddy terminates TLS on `80`/`443`.

## Request path

```text
browser / phone
      |
      v
Caddy 443  (production TLS)
      |
      v
nginx 80 --auth_request--> auth:8000/verify
      |
      +-- /app1/* -> app1:8000   adds X-Actor
      +-- /app2/* -> app2:8000   adds X-Actor (or Bearer for mobile routes)
      +-- /app3/* -> app3:8000   adds X-Device
      +-- /auth/* -> auth:8000
      +-- /       -> Northpoint static UI
```

nginx strips the `/appN/` prefix before proxying. Therefore:

```text
public URL = /<appN> + path in that service's OpenAPI document
```

| OpenAPI path | Public URL |
|---|---|
| app1 `/employees` | `/app1/employees` |
| app2 `/photos/5/file` | `/app2/photos/5/file` |
| app2 `/mobile-upload` | `/app2/mobile-upload` |
| app3 `/live/{dev}` | `/app3/live/{dev}` |
| app3 `/` | `/app3/` (keep the trailing slash) |

The full routing and auth table is in [ARCHITECTURE.md](ARCHITECTURE.md).

## Quick start

```bash
docker compose -f docker-compose.yaml -f docker-compose.local.yaml up -d --build
```

Open <http://localhost:8081>. Account creation, phone sign-in, data paths, OpenAPI extraction, and useful commands are in [SETUP.md](SETUP.md).

Try the gate once the stack is up:

```bash
# unauthenticated read -> 401
curl -i http://localhost:8081/app1/employees

# sign in and reuse the cookie
curl -fsS -c cookies.txt -o /dev/null \
  -d 'username=james&password=YOUR_PASSWORD' \
  http://localhost:8081/auth/login
curl -fsS -b cookies.txt http://localhost:8081/app1/employees
```

## Feature details

- **Violations:** a rulebook of categories → specific violations → penalty tiers. Issued records snapshot the penalty; removals are audited and still count toward repeat offenses. Employee lists support search, department/position filters, and active/total offense thresholds.
- **Photos:** the Android app uploads JPG/PNG/WebP with location, capture time, and optional expected identity. HR edits metadata, renames files, downloads originals, deletes in bulk, and reviews activity. Browser uploads are disabled.
- **GPS:** phones send point batches; the service filters jitter, keeps live state in memory, persists daily segments, and serves a map. A device token may post GPS, upload photos, and edit its own photo titles; it cannot read app1.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the domain model, endpoints, and data ownership.

## Repository map

```text
app/            app1 FastAPI app (routers, schemas, error handlers)
auth/           auth service, device identities, manage.py CLI
pt_service/     app2 photo API
gps_service/    app3 GPS API
frontend/       static UI (northpoint/ is maintained; others are compatibility pages)
nginx/          reverse proxy + auth_request config
Caddyfile       production TLS vhost
queries.py      main app1 query layer
models.py       app1 database models
bootstrap.py    legacy manual DB helper (not used by Compose)
tests/          pytest suite; tests/unit/ holds pure helper tests
data/           local databases and uploads (created at runtime)
```

## Documentation

| Document | Use it for |
|---|---|
| [SETUP.md](SETUP.md) | local/production startup, accounts, devices, env paths, OpenAPI |
| [ARCHITECTURE.md](ARCHITECTURE.md) | request flow, auth rules, service responsibilities, API contracts |
| [TESTING.md](TESTING.md) | commands, markers, fixtures, test layout |
| [DEPLOY.md](DEPLOY.md) | manual build → registry → VPS deploy and rollback |
| [COMPANY_RULES.md](COMPANY_RULES.md) | source data for the rulebook importer |
| [frontend/northpoint/README.md](frontend/northpoint/README.md) | frontend notes and importer options; verify behavior against [ARCHITECTURE.md](ARCHITECTURE.md) |

The maintained frontend is generated with `node build.mjs` and checked with `node verify.mjs` from `frontend/northpoint/`. Its `config.js` defaults to same-origin API calls, so the UI follows whichever host served it.
