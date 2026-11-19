![tests](https://github.com/jooecoodes/cs317-swe/actions/workflows/tests.yml/badge.svg)

# Northpoint

Internal HR and tracking stack. One Docker Compose setup serves the dashboard, violation tracker, employee photo library, GPS ingest, and the auth gate in front of everything.

## What it does

| Area | Path | Purpose |
|---|---|---|
| Northpoint UI | `/` | HR dashboard, employees, rulebook, photos, reports, map |
| Violation tracker | `/app1/` | Rulebook, violations, audit history, analytics |
| Photo library | `/app2/` | Employee photo uploads with GPS context |
| GPS tracking | `/app3/` | Phone GPS batches, live state, daily routes |
| Auth | `/auth/` | Login, device tokens, request verification |

## Quick start

```bash
docker compose -f docker-compose.yaml -f docker-compose.local.yaml up -d --build
```

Open [http://localhost:8081](http://localhost:8081).

Full setup, accounts, devices, and useful commands live in [SETUP.md](SETUP.md).

## Docs

| Document | What's in it |
|---|---|
| [SETUP.md](SETUP.md) | Local + production startup, accounts, devices |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Request flow, auth rules, service responsibilities |
| [TESTING.md](TESTING.md) | Test commands, markers, fixtures |
| [DEPLOY.md](DEPLOY.md) | Build, registry, VPS deploy and rollback |
| [COMPANY_RULES.md](COMPANY_RULES.md) | Source data for the rulebook importer |
| [frontend/northpoint/README.md](frontend/northpoint/README.md) | Frontend notes |

That's it. Everything else is in the docs above.
