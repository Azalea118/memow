# Photo tracking integration

Merged from memow-feature-northpoint-photo-tracking-20261115-232829 into JoeFork. The existing Northpoint shell, HR/offense rules, map tracking and browser sign-in are retained. Photo Library uses real app2 data: periods, source badges, employee authors, Philippine times, saved locations, activity, history, download and deletion. Browser camera/upload controls are intentionally disabled like the source; employees upload using Android. No databases, accounts, uploads or source tests were copied.

Outside frontend: pt_service/main.py is the updated photo backend; pt_service/ui.html and camera.html redirect to Northpoint. auth/mobile_access.py plus an additive migration/router registration in auth/main.py provide employee-linked tracker identity required by mobile uploads. Existing users, sessions and legacy GPS tracker access remain intact. The added Mobile App Access panel lets HR link or create the employee tracker account. No accounts are created automatically.

Restart auth and app2 after deploying. Mobile uploads require an employee-linked tracker account; legacy unlinked GPS accounts keep GPS access but cannot impersonate an employee when uploading.

The source geocoding/ folder is optional and separate from the main stack. It performs local place-name enrichment; follow its README to provision its map data. It is not automatically started or downloaded. Saved coordinate maps work immediately; place labels appear when enrichment is configured.
