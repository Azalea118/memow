# Optional local place names for Northpoint

This extension fills the existing `photo_records.location_name` field using saved
GPS metadata. The Photo Titles API and web dashboard already expose/display it.
No APK rebuild, mobile PR change, upload-route change or app2 restart is needed.
Install the Photo Titles backend first. The normal Northpoint stack keeps running.

## Architecture and limits

A separate worker checks for unnamed photos every 15 seconds, in batches of 50.
It covers old photos, delayed offline uploads, and new photos. It stores retry
state and an exact-coordinate cache in two additive SQLite tables. Requests have
a 3-second socket timeout, no proxy or redirects, and a custom User-Agent.
Only an explicitly local provider is accepted. No photo, employee name or title
is sent to Nominatim. Upload requests never call the geocoder.

A failed lookup leaves location_name empty and retries with a delay. Provider
failures back off from 30 seconds up to one hour; no-result/invalid/outside-area
records wait one day. Existing nonempty place labels are not overwritten.
The worker changes neither original GPS metadata nor photo timestamps or titles.
The API may initially return no place name; refresh the HR library after processing.

The buffered crop is longitude 123.8–126.0 and latitude 7.0–9.1, covering the
intended Cagayan de Oro/Bukidnon area and surrounding places. Complete boundary
relations may bring additional geometry into the extract. The worker does not
query positions outside this rectangle. Do not present nearby road/place labels
as proof of an exact building/site. Employee titles and the original GPS pin are
still the evidence to review. Unmapped streets cannot be invented.

Nominatim uses `full` import style to retain mapped landmarks, reverse-only
indexes, frozen data, and one import thread. Its container is capped at 4 GB;
PostgreSQL settings are reduced. These are conservative test settings, not a
measured capacity guarantee. Your current 6.7 GiB Docker allocation should leave
some room for the existing stack, but a real import must still be tested.

## Windows PowerShell 5.1

Run from the backend repository:

```powershell
Set-Location 'C:\Users\Carl Jazzel\Projects\memow'
powershell -NoProfile -ExecutionPolicy Bypass -File .\geocoding\SETUP.ps1 -Stage Prepare
```

This builds a small map-extraction utility, downloads the Philippines OSM PBF
(currently about 585 MB, subject to change), and creates a regional extract.
Container images are additional downloads. It does not import the whole country
into Nominatim. Keep the source PBF for now; do not commit any data directory.
The existing repository already ignores `data`.

Then:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\geocoding\SETUP.ps1 -Stage Start
```

Leave the PowerShell window open during import. The script checks free space
on the system and repository drives, and stops the map server if less than 5 GB
remains. If Docker's disk image is on another drive, check that drive manually
as well. The guard is not a disk quota, and import size is not yet measured.
Do not run Docker pruning or remove volumes to resolve space issues.

Start waits for the map service, creates a SQLite-consistent `.db.bak` backup
beside photos.db, and starts the worker. PostgreSQL is in its own named volume.
The geocoder's diagnostic HTTP port is bound only to 127.0.0.1:8088; PostgreSQL
is not published. Do not expose either service publicly.

If any command fails, stop and share the error. Do not delete partially imported
data or blindly rerun initialization; inspect its logs first:

```powershell
docker compose -f .\geocoding\compose.yaml logs --tail 40 nominatim
```

## Verify

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\geocoding\SETUP.ps1 -Stage Status
```

Worker logs show checked/resolved counts without employee coordinates or names.
After a minute, Refresh Photos and reopen an existing photo's details. Check that
the place appears above the map and the GPS pin/title/date/source badge match the
original. Upload a new titled photo; ensure it succeeds even with geocoder stopped,
then restart geocoder and confirm the name fills in. Test real sites in both CDO
and Bukidnon. Some areas legitimately have only barangay/city-level OSM names.

The map provides approximate labels from OpenStreetMap contributors (ODbL):
https://www.openstreetmap.org/copyright
Keep the dashboard's existing OpenStreetMap attribution visible.

## Stop / rollback

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\geocoding\SETUP.ps1 -Stage Stop
```

This stops only the optional worker and geocoder. Uploads/GPS remain independent,
and resolved labels remain. Do not restore the entire backup over a database with
newer uploads. If labels need correction, have the maintainer clear only affected
location_name values and matching cache entries after taking a fresh backup.
Nominatim restart is deliberately manual (`-Stage Start`) after reboot so the
initial import cannot restart unsupervised. The worker can retry while it is off.

## Maintenance / review

Map data is a frozen snapshot. No automatic replication has been configured.
For a refresh, import a new extract into a separate volume and validate it before
switching; cached labels also need an explicit refresh policy. The image is tagged
`mediagis/nominatim:5.3`; pin the validated digest before a production deployment.
Production needs this service deployed on the actual server; running it on one
contributor's PC is not a team deployment.

Tests: `uv run pytest tests/test_photo_geocoding.py -q`.
SQLite/mock-provider tests are automated. Windows setup, Docker import, actual
regional coverage and load have not been executed in the patch author's environment.
This package is ready for local testing, not an assertion of merge readiness.

References:
- https://github.com/mediagis/nominatim-docker/blob/master/howto.md
- https://docs.osmcode.org/osmium/latest/osmium-extract.html
- https://download.geofabrik.de/asia/philippines.html
