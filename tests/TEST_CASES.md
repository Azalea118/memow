Gathering test list...
Running 252 tests to get statuses...

# Test Case Matrix

**Total Tests:** 252

### Module: App1
| Test ID | Description | Expected Result | Status |
|---|---|---|---|
| TC-001 | Openapi served | Assertions pass | **PASS** |
| TC-002 | List employees empty | Assertions pass | **PASS** |
| TC-003 | Create employee | Assertions pass | **PASS** |
| TC-004 | Get employee by id | Assertions pass | **PASS** |
| TC-005 | Get employee by code | Assertions pass | **PASS** |
| TC-006 | Get employee 404 | Assertions pass | **PASS** |
| TC-007 | Get employee by code 404 | Assertions pass | **PASS** |
| TC-008 | Update employee | Assertions pass | **PASS** |
| TC-009 | Deactivate then reactivate | Assertions pass | **PASS** |
| TC-010 | Delete employee | Assertions pass | **PASS** |
| TC-011 | Create duplicate employee code | Assertions pass | **PASS** |
| TC-012 | Create violation type | Assertions pass | **PASS** |
| TC-013 | Active violation types excludes inactive | Assertions pass | **PASS** |
| TC-014 | All violation types includes inactive | Assertions pass | **PASS** |
| TC-015 | Get violation type 404 | Assertions pass | **PASS** |
| TC-016 | Deactivate activate violation type | Assertions pass | **PASS** |
| TC-017 | Assign violation snapshots points | Assertions pass | **PASS** |
| TC-018 | List employee violations | Assertions pass | **PASS** |
| TC-019 | Employee totals | Assertions pass | **PASS** |
| TC-020 | Employee detail includes violations | Assertions pass | **PASS** |
| TC-021 | Recent violations feed | Assertions pass | **PASS** |
| TC-022 | Violation get 404 | Assertions pass | **PASS** |
| TC-023 | Activity timeline empty | Assertions pass | **PASS** |
| TC-024 | Integration check: X-Actor -> ActorDep -> ActivityEvent.actor. | Assertions pass | **PASS** |
| TC-025 | Analytics endpoints respond on empty db | Assertions pass | **PASS** |
| TC-026 | errors.py says ViolationTypeInUse -> 409. | Assertions pass | **PASS** |
| TC-027 | deps.get_actor raises 400 when X-Actor is missing — documented contract. | Assertions pass | **PASS** |


### Module: App1_Activity
| Test ID | Description | Expected Result | Status |
|---|---|---|---|
| TC-028 | Calendar shows today activity | Assertions pass | **PASS** |
| TC-029 | Daily digest highlights employee created | Assertions pass | **PASS** |
| TC-030 | Timeline filters by actor | Assertions pass | **PASS** |


### Module: App1_Filters
| Test ID | Description | Expected Result | Status |
|---|---|---|---|
| TC-031 | Search by first name | Assertions pass | **PASS** |
| TC-032 | Search by code | Assertions pass | **PASS** |
| TC-033 | If 1 employee matches the search, total must be 1.  Currently FAILS: count_employees doesn't accept `search`, so total reflects all employees. Frontend pagination will be wrong. | Assertions pass | **XFAIL (Known Bug)** |
| TC-034 | If items match `department=Engin` (substring), total must agree.  Currently FAILS: search_employees uses ilike('%Engin%'), but count_employees uses exact equality. So items=1, total=0. | Assertions pass | **XFAIL (Known Bug)** |
| TC-035 | Min points filter | Assertions pass | **PASS** |
| TC-036 | Min strikes filter | Assertions pass | **PASS** |
| TC-037 | Deactivated excluded from default search | Assertions pass | **PASS** |


### Module: App1_Queries
| Test ID | Description | Expected Result | Status |
|---|---|---|---|
| TC-038 | Update employee 404 | Assertions pass | **PASS** |
| TC-039 | Deactivate employee 404 | Assertions pass | **PASS** |
| TC-040 | Reactivate employee 404 | Assertions pass | **PASS** |
| TC-041 | Delete employee 404 | Assertions pass | **PASS** |
| TC-042 | totals uses queries.get_employee_totals → raises EmployeeNotFound. | Assertions pass | **PASS** |
| TC-043 | Update violation type 404 | Assertions pass | **PASS** |
| TC-044 | Activate violation type 404 | Assertions pass | **PASS** |
| TC-045 | Deactivate violation type 404 | Assertions pass | **PASS** |
| TC-046 | Delete violation type 404 | Assertions pass | **PASS** |
| TC-047 | Assign violation missing employee | Assertions pass | **PASS** |
| TC-048 | Assign violation missing vtype | Assertions pass | **PASS** |
| TC-049 | Update violation record 404 | Assertions pass | **PASS** |
| TC-050 | Remove violation record 404 | Assertions pass | **PASS** |
| TC-051 | Clear violations missing employee | Assertions pass | **PASS** |
| TC-052 | Assign violation inactive type | Assertions pass | **PASS** |
| TC-053 | Create duplicate violation type name | Assertions pass | **PASS** |
| TC-054 | Update employee to duplicate code | Assertions pass | **PASS** |
| TC-055 | Update violation type to duplicate name | Assertions pass | **PASS** |
| TC-056 | Bulk create duplicate | Assertions pass | **PASS** |
| TC-057 | Update employee all fields | Assertions pass | **PASS** |
| TC-058 | Update violation record fields | Assertions pass | **PASS** |
| TC-059 | Update violation type fields | Assertions pass | **PASS** |
| TC-060 | List employee violations only strikes | Assertions pass | **PASS** |
| TC-061 | List employee violations since until | Assertions pass | **PASS** |
| TC-062 | List recent violations only strikes | Assertions pass | **PASS** |
| TC-063 | Analytics top offenders by strikes | Assertions pass | **PASS** |
| TC-064 | Analytics top offenders by records | Assertions pass | **PASS** |
| TC-065 | Analytics activity week bucket | Assertions pass | **PASS** |
| TC-066 | Analytics activity month bucket | Assertions pass | **PASS** |
| TC-067 | Violation free employees with since | Assertions pass | **PASS** |
| TC-068 | Removals search | Assertions pass | **PASS** |
| TC-069 | Removals filter by removed by | Assertions pass | **PASS** |
| TC-070 | Activity timeline target type filter | Assertions pass | **PASS** |
| TC-071 | Activity timeline employee id filter | Assertions pass | **PASS** |
| TC-072 | Activity timeline date range | Assertions pass | **PASS** |
| TC-073 | Activity timeline day filter | Assertions pass | **PASS** |
| TC-074 | Search by position | Assertions pass | **PASS** |


### Module: App1_Workflows
| Test ID | Description | Expected Result | Status |
|---|---|---|---|
| TC-075 | Remove violation creates audit trail | Assertions pass | **PASS** |
| TC-076 | Clear employee violations removes all | Assertions pass | **PASS** |
| TC-077 | Activity survives hard delete | Assertions pass | **PASS** |
| TC-078 | Bulk create employees | Assertions pass | **PASS** |
| TC-079 | Top offenders ordering | Assertions pass | **PASS** |
| TC-080 | Watchlist returns repeat strikers | Assertions pass | **PASS** |
| TC-081 | Analytics departments with real data | Assertions pass | **PASS** |


### Module: Auth
| Test ID | Description | Expected Result | Status |
|---|---|---|---|
| TC-082 | Login page renders | Assertions pass | **PASS** |
| TC-083 | Login wrong password is 401 | Assertions pass | **PASS** |
| TC-084 | Login then me | Assertions pass | **PASS** |
| TC-085 | Verify blocks without credentials | Assertions pass | **PASS** |
| TC-086 | Verify succeeds with session | Assertions pass | **PASS** |
| TC-087 | Logout clears session | Assertions pass | **PASS** |
| TC-088 | Device tokens may only POST /app3/* — enforced by /verify. | Assertions pass | **PASS** |


### Module: Gps_Service
| Test ID | Description | Expected Result | Status |
|---|---|---|---|
| TC-089 | First point saved | Assertions pass | **PASS** |
| TC-090 | Live after receive | Assertions pass | **PASS** |
| TC-091 | Live unknown device | Assertions pass | **PASS** |
| TC-092 | Devices lists online | Assertions pass | **PASS** |
| TC-093 | Route returns segments | Assertions pass | **PASS** |
| TC-094 | Device binding rejects mismatched id | Assertions pass | **PASS** |
| TC-095 | Points with ts < midnight Asia/Manila are purged. | Assertions pass | **PASS** |
| TC-096 | Points with ts >= midnight are kept. | Assertions pass | **PASS** |
| TC-097 | A point at exactly 00:00:00 today is kept (strict <). | Assertions pass | **PASS** |
| TC-098 | state dict is wiped when purge deletes at least one row. | Assertions pass | **PASS** |
| TC-099 | Purge is idempotent — if nothing was deleted, state is NOT cleared. | Assertions pass | **PASS** |


### Module: Gps_Service_Extended
| Test ID | Description | Expected Result | Status |
|---|---|---|---|
| TC-100 | Empty batch saves nothing | Assertions pass | **PASS** |
| TC-101 | Missing id returns 422 | Assertions pass | **PASS** |
| TC-102 | Missing points returns 422 | Assertions pass | **PASS** |
| TC-103 | Bad point type returns 422 | Assertions pass | **PASS** |
| TC-104 | One batch seeds AND confirms movement in the same call. | Assertions pass | **PASS** |
| TC-105 | Resend same batch is idempotent | Assertions pass | **PASS** |
| TC-106 | Out of order batch points sorted | Assertions pass | **PASS** |
| TC-107 | High acc point is dropped | Assertions pass | **PASS** |
| TC-108 | Even the very first point must pass the accuracy gate. | Assertions pass | **PASS** |
| TC-109 | Tiny movement dropped as jitter | Assertions pass | **PASS** |
| TC-110 | Coherent movement creates single segment | Assertions pass | **PASS** |
| TC-111 | Time gap creates new segment | Assertions pass | **PASS** |
| TC-112 | Tokens created via add-device have no `user:` prefix -> no check. | Assertions pass | **PASS** |
| TC-113 | Device header with matching colon passes | Assertions pass | **PASS** |
| TC-114 | Devices reports tracker from header | Assertions pass | **PASS** |
| TC-115 | Devices tracker is none without header | Assertions pass | **PASS** |
| TC-116 | Devices include offline param accepted | Assertions pass | **PASS** |
| TC-117 | Devices accuracy passed through | Assertions pass | **PASS** |
| TC-118 | First seen resets after long gap | Assertions pass | **PASS** |
| TC-119 | Live status becomes disconnected after timeout | Assertions pass | **PASS** |
| TC-120 | Route unknown device is empty | Assertions pass | **PASS** |
| TC-121 | Route returns only saved points | Assertions pass | **PASS** |
| TC-122 | /map serves map.html via FileResponse — file presence is a deployment concern, not a test concern; we only assert the route exists. | Assertions pass | **PASS** |


### Module: Pt_Service
| Test ID | Description | Expected Result | Status |
|---|---|---|---|
| TC-123 | Upload requires actor | Assertions pass | **PASS** |
| TC-124 | Upload and get | Assertions pass | **PASS** |
| TC-125 | List photos | Assertions pass | **PASS** |
| TC-126 | Delete photo | Assertions pass | **PASS** |
| TC-127 | Activity log records upload | Assertions pass | **PASS** |


### Module: Pt_Service_Extended
| Test ID | Description | Expected Result | Status |
|---|---|---|---|
| TC-128 | Rename updates display name only | Assertions pass | **PASS** |
| TC-129 | Rename with rename file replaces on disk | Assertions pass | **PASS** |
| TC-130 | RenameRequest allows length >= 1 (Pydantic); route strips and rejects. | Assertions pass | **PASS** |
| TC-131 | Rename empty string 422 by pydantic | Assertions pass | **PASS** |
| TC-132 | Rename 404 for missing photo | Assertions pass | **PASS** |
| TC-133 | Rename creates activity entry | Assertions pass | **PASS** |
| TC-134 | History returns upload and delete for deleted photo | Assertions pass | **PASS** |
| TC-135 | History for living photo includes links | Assertions pass | **PASS** |
| TC-136 | History unknown photo returns empty | Assertions pass | **PASS** |
| TC-137 | History pagination | Assertions pass | **PASS** |
| TC-138 | Digest default is today | Assertions pass | **PASS** |
| TC-139 | Digest from date only uses same date | Assertions pass | **PASS** |
| TC-140 | Digest rejects inverted range | Assertions pass | **PASS** |
| TC-141 | Digest rejects range above limit | Assertions pass | **PASS** |
| TC-142 | Digest yesterday has no activity | Assertions pass | **PASS** |
| TC-143 | Digest groups by actor within day | Assertions pass | **PASS** |
| TC-144 | Digest filters by actor | Assertions pass | **PASS** |
| TC-145 | Digest q filter | Assertions pass | **PASS** |
| TC-146 | Digest include items false still reports counts | Assertions pass | **PASS** |
| TC-147 | Insert raw ActivityLog rows on two different days. | Assertions pass | **PASS** |
| TC-148 | Digest summary non empty when activity exists | Assertions pass | **PASS** |
| TC-149 | Batch returns found and missing | Assertions pass | **PASS** |
| TC-150 | Batch dedupes ids preserving order | Assertions pass | **PASS** |
| TC-151 | Batch empty ids 422 | Assertions pass | **PASS** |
| TC-152 | Batch requires actor | Assertions pass | **PASS** |
| TC-153 | Bulk delete multiple | Assertions pass | **PASS** |
| TC-154 | Bulk delete ignores unknown ids | Assertions pass | **PASS** |
| TC-155 | Bulk delete reports missing file | Assertions pass | **PASS** |
| TC-156 | Bulk delete logs activity per photo | Assertions pass | **PASS** |
| TC-157 | Bulk delete empty ids 422 | Assertions pass | **PASS** |


### Module: Pt_Service_Extended_Coverage
| Test ID | Description | Expected Result | Status |
|---|---|---|---|
| TC-158 | Patch display name only | Assertions pass | **PASS** |
| TC-159 | Patch partial leaves other fields alone | Assertions pass | **PASS** |
| TC-160 | Patch empty display name 422 | Assertions pass | **PASS** |
| TC-161 | Patch whitespace description becomes none | Assertions pass | **PASS** |
| TC-162 | Patch tags dedupes and cleans | Assertions pass | **PASS** |
| TC-163 | Patch tags empty list clears | Assertions pass | **PASS** |
| TC-164 | Upload takes a comma-string via Form; PATCH requires List[str] via JSON. | Assertions pass | **PASS** |
| TC-165 | Unchanged payload -> no `edit` activity entry. | Assertions pass | **PASS** |
| TC-166 | Patch logs edit with diff | Assertions pass | **PASS** |
| TC-167 | Patch 404 | Assertions pass | **PASS** |
| TC-168 | Auth dependency resolves before the 404 check. | Assertions pass | **PASS** |
| TC-169 | Stats empty | Assertions pass | **PASS** |
| TC-170 | Stats counts and bytes | Assertions pass | **PASS** |
| TC-171 | Stats owner filter | Assertions pass | **PASS** |
| TC-172 | Quirk: `owner=` filter applies to counts/bytes but NOT to distinct_users. | Assertions pass | **PASS** |
| TC-173 | List owner filter | Assertions pass | **PASS** |
| TC-174 | List q search | Assertions pass | **PASS** |
| TC-175 | List tag filter | Assertions pass | **PASS** |
| TC-176 | List sort | Assertions pass | **PASS** |
| TC-177 | List pagination | Assertions pass | **PASS** |
| TC-178 | List total ignores pagination | Assertions pass | **PASS** |
| TC-179 | File serves bytes with cache header | Assertions pass | **PASS** |
| TC-180 | File 404 | Assertions pass | **PASS** |
| TC-181 | File 410 when missing on disk | Assertions pass | **PASS** |
| TC-182 | resolve_stored_path uses Path(name).name — any directory parts are stripped. | Assertions pass | **PASS** |
| TC-183 | Download content disposition | Assertions pass | **PASS** |
| TC-184 | Download sanitizes weird display name | Assertions pass | **PASS** |
| TC-185 | Activity actor filter case insensitive | Assertions pass | **PASS** |
| TC-186 | Activity action filter | Assertions pass | **PASS** |
| TC-187 | Activity photo id filter | Assertions pass | **PASS** |
| TC-188 | `q` also searches the raw details JSON — verify via original_filename. | Assertions pass | **PASS** |
| TC-189 | Activity date range filter | Assertions pass | **PASS** |
| TC-190 | Activity pagination | Assertions pass | **PASS** |
| TC-191 | Activity requires actor | Assertions pass | **PASS** |
| TC-192 | Actors aggregates per actor | Assertions pass | **PASS** |
| TC-193 | Actors sorted by total desc | Assertions pass | **PASS** |
| TC-194 | Actors q filter | Assertions pass | **PASS** |
| TC-195 | Upload bad extension 415 | Assertions pass | **PASS** |
| TC-196 | Upload bad content type 415 | Assertions pass | **PASS** |
| TC-197 | Upload oversize 413 and cleanup | Assertions pass | **PASS** |
| TC-198 | Camera route registered | Assertions pass | **PASS** |
| TC-199 | Ui route registered | Assertions pass | **PASS** |
| TC-200 | Standalone pt_service has NO auth gate on reads.  In production nginx fronts everything with /verify — this test documents the standalone surface so we notice if someone adds auth to a read endpoint without updating this file. Flip it when we do. | Assertions pass | **PASS** |


### Module: Safety_Canary
| Test ID | Description | Expected Result | Status |
|---|---|---|---|
| TC-201 | App1 engine redirected | Assertions pass | **PASS** |
| TC-202 | Pt engine redirected | Assertions pass | **PASS** |
| TC-203 | Gps engine redirected | Assertions pass | **PASS** |
| TC-204 | Auth db redirected | Assertions pass | **PASS** |
| TC-205 | Pt upload dir is temp | Assertions pass | **PASS** |


### Module: Auth_Helpers
| Test ID | Description | Expected Result | Status |
|---|---|---|---|
| TC-206 | Hash password verifies | Assertions pass | **PASS** |
| TC-207 | Hash password rejects wrong | Assertions pass | **PASS** |
| TC-208 | Hash password uses unique salt | Assertions pass | **PASS** |
| TC-209 | Check password handles malformed hash | Assertions pass | **PASS** |
| TC-210 | Hash token is sha256 | Assertions pass | **PASS** |
| TC-211 | Hash token is deterministic | Assertions pass | **PASS** |
| TC-212 | Safe next allows relative | Assertions pass | **PASS** |
| TC-213 | Safe next rejects protocol relative | Assertions pass | **PASS** |
| TC-214 | Safe next rejects backslashes | Assertions pass | **PASS** |
| TC-215 | Safe next rejects absolute urls | Assertions pass | **PASS** |
| TC-216 | Safe next handles empty | Assertions pass | **PASS** |
| TC-217 | Header safe strips non ascii | Assertions pass | **PASS** |
| TC-218 | Header safe empty becomes unknown | Assertions pass | **PASS** |
| TC-219 | Header safe keeps ascii | Assertions pass | **PASS** |


### Module: Gps_Math
| Test ID | Description | Expected Result | Status |
|---|---|---|---|
| TC-220 | Haversine same point is zero | Assertions pass | **PASS** |
| TC-221 | Haversine one degree latitude | Assertions pass | **PASS** |
| TC-222 | Haversine manila to quezon city | Assertions pass | **PASS** |
| TC-223 | Haversine is symmetric | Assertions pass | **PASS** |
| TC-224 | BREAKOUT_DIST=20 m; a single 5m step must fail. | Assertions pass | **PASS** |
| TC-225 | Random wandering doesn't build net movement in one direction. | Assertions pass | **PASS** |
| TC-226 | Three points ~10 m apart, straight north — coherent movement. | Assertions pass | **PASS** |
| TC-227 | Even with enough distance, back-and-forth fails straightness check. | Assertions pass | **PASS** |


### Module: Pt_Helpers
| Test ID | Description | Expected Result | Status |
|---|---|---|---|
| TC-228 | Safe component keeps alnum | Assertions pass | **PASS** |
| TC-229 | Safe component replaces spaces | Assertions pass | **PASS** |
| TC-230 | Safe component replaces path separators | Assertions pass | **PASS** |
| TC-231 | Safe component truncates to 80 | Assertions pass | **PASS** |
| TC-232 | Safe component falls back | Assertions pass | **PASS** |
| TC-233 | Parse tags splits on comma | Assertions pass | **PASS** |
| TC-234 | Parse tags strips whitespace | Assertions pass | **PASS** |
| TC-235 | Parse tags handles empty | Assertions pass | **PASS** |
| TC-236 | Dump tags deduplicates | Assertions pass | **PASS** |
| TC-237 | Dump tags strips commas within tags | Assertions pass | **PASS** |
| TC-238 | Dump tags returns none on empty | Assertions pass | **PASS** |
| TC-239 | Join naturally one | Assertions pass | **PASS** |
| TC-240 | Join naturally two | Assertions pass | **PASS** |
| TC-241 | Join naturally three | Assertions pass | **PASS** |
| TC-242 | Join naturally empty | Assertions pass | **PASS** |
| TC-243 | Verb phrase singular | Assertions pass | **PASS** |
| TC-244 | Verb phrase plural | Assertions pass | **PASS** |
| TC-245 | Noun phrase singular | Assertions pass | **PASS** |
| TC-246 | Noun phrase plural | Assertions pass | **PASS** |
| TC-247 | Summarize actor counts | Assertions pass | **PASS** |
| TC-248 | Summarize action totals | Assertions pass | **PASS** |
| TC-249 | Range summary empty day | Assertions pass | **PASS** |
| TC-250 | Range summary empty range | Assertions pass | **PASS** |
| TC-251 | Range summary single actor | Assertions pass | **PASS** |
| TC-252 | Range summary multi actor | Assertions pass | **PASS** |


