![tests](https://github.com/jooecoodes/cs317-swe/actions/workflows/tests.yml/badge.svg)

## Services

| Service | Role | Path |
|---------|------|------|
| caddy | TLS termination | 80, 443 |
| nginx | Routing + auth gate | internal |
| auth | Login, sessions, device tokens | `/auth/*` |
| app1 | Violation tracker | `/app1/*` |
| app2 | Performance tracker | `/app2/*` |
| app3 | GPS ingest + map | `/app3/*` |
| frontend | Static UI | `/` |

## Run locally

```bash
docker compose -f docker-compose.yaml -f docker-compose.local.yaml up -d --build
```

Open http://localhost:8081

## Mobile accounts — HR website only

Sign in using an existing HR/head-manager web account. Open Employees, choose
an employee, then open **Mobile App Access**. Enter a username and password
and click **Create Mobile Account**. The employee link is saved automatically.
Use this same section to reset passwords or enable/disable access. For an
older unlinked tracker, expand **Already has an older tracker account?** and
use **Link Existing Account** with its username and a new password.

All authenticated web users are authorized managers. Phone tokens cannot
create accounts or read the HR dashboard. No account-management terminal
commands are required. Keep the existing `data` directory when updating.
This update assumes your existing working HR sign-in; it does not ship a
shared/default HR password or a public registration page.

See `PHASE2_SETUP_WINDOWS.md` in the delivery package for installation,
Android build steps, and the acceptance checklist.

## Run on production (VPS)

```bash
docker compose -f docker-compose.yaml up -d --build
```

Back up `auth/auth.db` before every deploy.

## Auth

- Browser → session cookie (7 days)
- Phone → device token (`POST /app3/` for GPS; `POST /app2/mobile-upload` for linked employee photos; `/auth/device-me` validates its own token)
- nginx forwards every request to auth/verify before it reaches an app. That endpoint must return 2xx (allow), 401 (deny → redirect to login), or 403 (deny). Anything else — including a 500 — is surfaced to the client as a 500.

## Android

Repo: [cs317-swe-tracker](https://github.com/cs317-swe-tracker)

- Server URL: `https://cs317.duckdns.org/app3/`
- Device Token: from `add-device`

## Useful commands

```bash
# logs
docker compose -f docker-compose.yaml -f docker-compose.local.yaml logs -f nginx auth app1

# restart one service
docker compose -f docker-compose.yaml -f docker-compose.local.yaml restart app1

# reset auth data
rm auth/auth.db
```

## API schemas (OpenAPI)

Every FastAPI service publishes its schema at `/openapi.json`. The services aren't exposed to the host — only nginx can reach them — so pull the schema through the nginx container and write it to the host:

```bash
docker compose exec nginx wget -qO- http://app1:8000/openapi.json > app1_openapi.json
docker compose exec nginx wget -qO- http://app2:8000/openapi.json > app2_openapi.json
docker compose exec nginx wget -qO- http://app3:8000/openapi.json > app3_openapi.json
```

Rule:
```bash
public URL = /<appN> + path in appN_openapi.json
```

| Spec file[cite: 1] | Path in the spec[cite: 1] | Real URL through nginx[cite: 1] |
| :--- | :--- | :--- |
| `app1_openapi.json` | `/employees` | `/app1/employees` |
| `app2_openapi.json` | `/photos/5/file` | `/app2/photos/5/file` |
| `app3_openapi.json` | `/live/{dev}` | `/app3/live/{dev}` |
| `app3_openapi.json` | `/` (the upload) | `/app3/` (keep the trailing slash) |

## CI

```bash
uv run pytest tests/unit/ -v                    # unit
uv run pytest tests/ -m "not system" -v    # integration
uv run pytest tests/ -m system -v          # system
```
