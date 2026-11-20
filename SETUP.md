# Setup

Local startup, accounts, data locations, and day-to-day commands. For how the pieces fit together, see [ARCHITECTURE.md](ARCHITECTURE.md). For production releases, see [DEPLOY.md](DEPLOY.md).

## Requirements

- Docker with Compose
- `uv` and Python 3.12 if you want to run the test suite locally

## Run locally

```bash
docker compose -f docker-compose.yaml -f docker-compose.local.yaml up -d --build
```

Open <http://localhost:8081>. The local overlay publishes nginx on `8081` and sets `AUTH_COOKIE_SECURE=0` so sessions work over plain HTTP. Caddy is still started on `80`/`443`, but its only virtual host is the production domain; use `8081` locally.

Useful while developing:

```bash
# follow logs
docker compose -f docker-compose.yaml -f docker-compose.local.yaml logs -f nginx auth app1

# restart one service
docker compose -f docker-compose.yaml -f docker-compose.local.yaml restart app1
```

## Accounts

All long-lived account management goes through `auth.manage` inside the `auth` container.

```bash
COMPOSE="docker compose -f docker-compose.yaml -f docker-compose.local.yaml"

# create/update a browser user; prompts for first name, last name, role, password
$COMPOSE exec auth uv run --no-sync python -m auth.manage create-user james

# create/update a user without the role prompt (roles: c_manager, employee, hr, supervisor)
$COMPOSE exec auth uv run --no-sync python -m auth.manage create-user james --role hr

# change an existing user's role
$COMPOSE exec auth uv run --no-sync python -m auth.manage set-role james --role supervisor

# change only the displayed name, keeping password and active sessions
$COMPOSE exec auth uv run --no-sync python -m auth.manage set-name james

# create/update a tracker account used by a phone; prompts for a password
# changing the password logs out that tracker's devices
$COMPOSE exec auth uv run --no-sync python -m auth.manage create-tracker phone1

# disable a tracker and revoke all of its device tokens
$COMPOSE exec auth uv run --no-sync python -m auth.manage disable-tracker phone1

# list users, trackers, and devices
$COMPOSE exec auth uv run --no-sync python -m auth.manage list
```

Passwords for browser users are at least 10 characters; tracker passwords are at least 8.

Each browser user has one role. After sign-in nginx sends the user to that role's page:
`c_manager/`, `employee/`, `hr/`, or `supervisor/`. Users can open only their own role's
folder; the auth service rejects cross-role folder requests with `403`.

When HR adds an employee in Northpoint, the form also sets the employee type and the
first login username/password. app1 creates the employee and the linked auth account
together, so the employee can sign in immediately. Editing the type updates the auth
role; deactivation disables the login; reactivation enables it; deletion removes it.
The CLI account commands above remain available for recovery and for existing accounts
that predate employee linking.

## Phone sign-in and mobile access

The current phone flow is HTTP device login, not the older `add-device` helper:

```bash
curl -sS -X POST http://localhost:8081/auth/device-login \
  -H 'Content-Type: application/json' \
  -d '{"username":"phone1","password":"TRACKER_PASSWORD","device_id":"phone-1"}'
```

The response contains `token` and `expires_at`. Send that token as `Authorization: Bearer <token>`. Tokens live for 7 days with a sliding inactivity window.

Device-token permissions:

- `POST /app3/` — GPS ingest
- `POST /app2/mobile-upload` — employee photo upload
- `PATCH /app2/mobile-photos/{id}/title` — employee title edit

`POST /app2/mobile-upload` and the title endpoint additionally require the tracker to be linked to an **active employee whose type is Supervisor**. Only HR can issue tracker accounts, and only Supervisor employees are eligible. HR sets that link in Northpoint's **Mobile App Access** screen on a Supervisor profile; the underlying endpoints are under `/auth/employees/{id}/mobile-access`. A phone that is not linked can still send GPS but cannot upload photos.

The legacy `add-device` CLI command still creates a GPS-only token and is kept for old clients:

```bash
$COMPOSE exec auth uv run --no-sync python -m auth.manage add-device phone1
$COMPOSE exec auth uv run --no-sync python -m auth.manage revoke-device phone1
```

Those tokens are not linked to an employee and cannot use the `/app2/mobile-*` endpoints.

Android configuration from the existing client repo:

- Server URL: `https://cs317.duckdns.org/app3/`
- Photo uploads and title edits use the same host under `/app2/`
- For a local phone test, use `http://YOUR-PC-LAN-IP:8081/` instead of `localhost`

## Run on production

```bash
docker compose -f docker-compose.yaml up -d --build
```

Production reads the image tag from `TAG` (default `latest`) and sets `AUTH_COOKIE_SECURE=1`. Back up `./data` before risky deploys. The full build → push → VPS → rollback procedure is in [DEPLOY.md](DEPLOY.md).

## Data locations

Every stateful service shares the host `./data` directory mounted at `/app/data`:

| Environment variable | Host path | Contents |
|---|---|---|
| `AUTH_DB_PATH` | `data/auth/auth.db` | users, sessions, trackers, devices, mobile-access links |
| `APP1_DB_PATH` | `data/app1/app.db` | employees, rulebook, violations, audit events |
| `PT_DB_PATH` | `data/app2/photos.db` | photo metadata and activity |
| `PT_UPLOAD_DIR` | `data/app2/uploads` | uploaded image files |
| `GPS_DB_PATH` | `data/app3/tracking.db` | GPS points and daily segments |

`./data` is a bind mount, so it survives rebuilds and restarts. `caddy_data` is a named volume for TLS state.

## Rulebook data

Opening the app does **not** seed the violation rulebook. The maintained source is [COMPANY_RULES.md](COMPANY_RULES.md), imported through the frontend tool (from `frontend/northpoint/`):

```bash
node tools/import-company-rules.mjs --base-url http://localhost:8081/app1/          # preview
node tools/import-company-rules.mjs --base-url http://localhost:8081/app1/ --apply  # import
```

Set `NORTHPOINT_USERNAME` and `NORTHPOINT_PASSWORD` for an existing browser account first. See [frontend/northpoint/README.md](frontend/northpoint/README.md) for importer options and backups. `run.py`/`bootstrap.py` are legacy manual helpers and are not used by Compose.

## API schemas (OpenAPI)

app1, app2, and app3 publish `/openapi.json`. The auth service does not. Backends are not exposed to the host, so fetch schemas from inside the nginx container:

```bash
docker compose exec nginx wget -qO- http://app1:8000/openapi.json > app1_openapi.json
docker compose exec nginx wget -qO- http://app2:8000/openapi.json > app2_openapi.json
docker compose exec nginx wget -qO- http://app3:8000/openapi.json > app3_openapi.json
```

Public URL rule:

```text
public URL = /<appN> + path in appN_openapi.json
```

| Spec file | Path in spec | Public URL |
|---|---|---|
| `app1_openapi.json` | `/employees` | `/app1/employees` |
| `app2_openapi.json` | `/photos/5/file` | `/app2/photos/5/file` |
| `app2_openapi.json` | `/mobile-upload` | `/app2/mobile-upload` |
| `app3_openapi.json` | `/live/{dev}` | `/app3/live/{dev}` |
| `app3_openapi.json` | `/` | `/app3/` (keep the trailing slash) |

## Reset local auth data

Only do this on a disposable local stack:

```bash
docker compose -f docker-compose.yaml -f docker-compose.local.yaml stop auth
rm data/auth/auth.db
docker compose -f docker-compose.yaml -f docker-compose.local.yaml start auth
```

Deleting the file removes all users, sessions, trackers, and device tokens. Other services' data is untouched.
