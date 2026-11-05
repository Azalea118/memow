# Deploy Runbook

Manual deploy loop: **build → registry holds → VPS runs**.
No CI.

> **The only thing that changes per deploy is `<TAG>`.**
> Everything else in this file is literal — copy it as-is.
> Replace `<TAG>` with a value you choose (see [Picking a tag](#picking-a-tag)).

---

## Picking a tag

`<TAG>` is a placeholder. Choose **one** value per release and use it everywhere below. Pick one scheme and stick to it:

| Scheme | Example `<TAG>` | When to use |
|---|---|---|
| Date | `2026-11-05` | you deploy by date; no versioning debate |
| Date + revision | `2026-11-05b` | multiple deploys in one day |
| Semver | `1.1.0` | you cut named releases |
| Git sha | `sha-a1b2c3d` | every commit is a candidate; best for rollback |

Whatever you pick: **not `latest` alone.** `latest` points at whatever you pushed last, so after a bad deploy it points at the bad image too — no way back. Every `docker push` in this file also tags a real value, and that real value is what you deploy.

Write it down before you start. You'll type it 3 times on your machine and 2 times on the VPS.

---

## Conventions

- **Image**: `ghcr.io/jooecoodes/cs317-swe`
- **Tag placeholder**: `<TAG>` — substituted per deploy
- **VPS**: `root@droplet-exp`, working dir `~/cs317-swe-tarball`
- **Volumes**: `./data:/app/data` on the host — DBs, uploads, everything stateful. Never touched by a deploy.

---

## 1. Build 

```bash
cd ~/Projects/backend

TAG=<TAG>                       # ← substitute, e.g. TAG=2026-11-05

docker build --target prod -t ghcr.io/jooecoodes/cs317-swe:$TAG .
```

`--target prod` builds only the prod stage. Without it, Docker uses the last stage — works today, silently changes what ships if you add stages later.

---

## 2. Verify the image before pushing

```bash
# no dev DBs leaked in — must print NOTHING
docker run --rm ghcr.io/jooecoodes/cs317-swe:$TAG sh -c \
  'find /app -name "*.db*" -o -name "uploads" -type d | head'

# frontend at the root nginx serves from (index.html, not northpoint/index.html)
docker run --rm ghcr.io/jooecoodes/cs317-swe:$TAG ls /usr/share/nginx/html/
```

**Do not skip the first check.** If it prints a path, your `.dockerignore` failed and you are about to push dev data (password hashes, GPS traces) to a public registry. Fix `.dockerignore`, rebuild, re-verify.

---

## 3. Login ( once per session)

```bash
read -rs GITHUB_TOKEN
echo "$GITHUB_TOKEN" | docker login ghcr.io -u jooecoodes --password-stdin
unset GITHUB_TOKEN
```

Token needs `write:packages`. Never put the token directly on the command line — it lands in shell history.

---

## 4. Push

```bash
docker push ghcr.io/jooecoodes/cs317-swe:$TAG
```

**Wait for the digest line:**

```
<TAG>: digest: sha256:abc123... size: 1234
```

The tag on the left of `: digest:` will be whatever you set `TAG` to. No digest line = push didn't complete. Do not go to the VPS.

---

## 5. Deploy (VPS)

```bash
ssh root@droplet-exp
cd ~/cs317-swe-tarball
```

### First deploy only

```bash
mkdir -p data/auth data/app1 data/app2/uploads data/app3
chown -R $(id -u):$(id -g) data
```

Skip on every later deploy. `data/` persists.

### Every deploy

```bash
export TAG=<TAG>                # ← same value as step 1

docker compose pull             # must succeed — if this fails, stop
docker compose up -d
```

`pull` **before** `up`. Otherwise Compose sees `build:` in the compose file and no local image, tries to build on the VPS (no source code there) → `failed to solve` / context errors.

### Persist the tag

```bash
echo "TAG=$TAG" > .env
```

Compose reads `.env` automatically. After a reboot, `docker compose up -d` uses the same tag without you remembering it. Rollback becomes one line.

---

## 6. Verify

```bash
docker compose ps
# every service Up — no Restarting, no Exited

docker compose logs --tail=30 auth nginx
# no tracebacks, no "connect() failed", no "no live upstreams"

curl -kI https://your.domain.tld/auth/login
# 200 or 302, Server: Caddy
```

`-k` skips cert verification. With a real domain and Let's Encrypt cert it's unnecessary, but harmless during a rollout.

Optional cleanup, only if disk pressure:

```bash
docker image prune -f           # dangling images only — never the running one
```

---

## 7. Rollback

```bash
# VPS
cd ~/cs317-swe-tarball

export TAG=<PREVIOUS_TAG>       # ← known-good tag, e.g. 2026-11-04
docker compose pull
docker compose up -d

echo "TAG=$TAG" > .env
```

Volumes untouched. `data/` untouched. DBs intact. This is the whole reason to use real versions instead of `latest`.

Then fix on the machine, build a new tag, deploy forward.

---

## The whole loop, one block

```bash
# ──  ────────────────────────────────────────────
cd ~/Projects/backend
TAG=<TAG>                                    # ← substitute once
docker build --target prod -t ghcr.io/jooecoodes/cs317-swe:$TAG .
docker run --rm ghcr.io/jooecoodes/cs317-swe:$TAG sh -c 'find /app -name "*.db*" | head'
read -rs GITHUB_TOKEN && echo "$GITHUB_TOKEN" | docker login ghcr.io -u jooecoodes --password-stdin && unset GITHUB_TOKEN
docker push ghcr.io/jooecoodes/cs317-swe:$TAG
# ── wait for digest line ──────────────────────────────

# ── VPS ───────────────────────────────────────────────
ssh root@droplet-exp
cd ~/cs317-swe-tarball
export TAG=<TAG>                             # ← same value
docker compose pull
docker compose up -d
echo "TAG=$TAG" > .env
docker compose ps
curl -kI https://your.domain.tld/auth/login
```

---

## Fallback: tarball (no registry)

Use when the registry push is failing and you need it deployed now.

```bash
TAG=<TAG>
docker save ghcr.io/jooecoodes/cs317-swe:$TAG | gzip > cs317-$TAG.tar.gz
scp cs317-$TAG.tar.gz root@droplet-exp:~/cs317-swe-tarball/

# VPS
cd ~/cs317-swe-tarball
gunzip -c cs317-$TAG.tar.gz | docker load
export TAG=<TAG>                             # ← same value
docker compose up -d                         # no `pull` — image is local
echo "TAG=$TAG" > .env
```

Same end state, no login, no registry. Fix the registry path when you're not under time pressure.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `docker push` → `denied` / `unauthorized` | token missing `write:packages` | regenerate PAT with that scope |
| `docker push` hangs | no stdin for `--password-stdin`, or network | use the `echo "$TOKEN" \| docker login` form; retry |
| `docker compose pull` → `manifest unknown` | wrong `<TAG>`, or push didn't finish | check the digest line from step 4 |
| `docker compose pull` → `denied` | package is private, VPS not logged in | `docker login ghcr.io -u jooecoodes --password-stdin` on VPS |
| `docker compose pull` → `NAME_UNKNOWN` | package doesn't exist in GHCR | push from the machine first |
| `docker compose up -d` → `failed to solve` | VPS tried to build | run `pull` first |
| Caddy logs cert errors | DNS not pointing at VPS, or 80/443 blocked | check DNS A record and firewall |
| 502 from Caddy | nginx can't reach a backend | `docker compose logs nginx`; `docker compose exec nginx wget -qO- http://auth:8000/` |
| App logs `unable to open database file` | `data/<svc>/` missing on host | `mkdir -p data/auth data/app1 data/app2/uploads data/app3` |
| Login returns 401 | `auth.db` has no users (fresh volume) | register a user; or restore a backed-up `auth.db` |
| Login loops `login → verify → login` | cookie not set / `AUTH_COOKIE_SECURE` mismatch | local: `AUTH_COOKIE_SECURE=0`; VPS: leave default `1` with HTTPS |
| Container `Restarting` | config error | `docker compose logs <svc>` |

---

## Backup (before risky deploys)

```bash
# VPS
docker compose stop auth app1 app2 app3
tar czf ~/backup-$(date +%F-%H%M).tgz -C ~/cs317-swe-tarball data
docker compose up -d
```

Stop-first avoids torn SQLite writes (WAL sidecars). Restore by extracting over `data/` while services are stopped.

---

## Periodic hygiene

```bash
# VPS, every few weeks or when disk >80%
docker image prune -f
docker builder prune -f

df -h
docker system df
```

Never `docker compose down -v` on the VPS — the `-v` deletes named volumes. `./data` is a bind mount and survives, but `caddy_data` (certs) does not, and you'd re-issue certs.

---

## Release log

Append one line per deploy. This is the only way to answer "what was in that version" six weeks later.

```
<TAG>              <YYYY-MM-DD>    <one-line summary>
```

Example (fill in your own — these are placeholders):

```
2026-11-05         2026-11-05      initial prod deploy
2026-11-12         2026-11-12      gps batching + auth cookie fix
```
