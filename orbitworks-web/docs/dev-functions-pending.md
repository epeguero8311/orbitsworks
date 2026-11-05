# Dev functions held back from orbitworks-dev-ew (now deployed)

**Deployed to dev 2026-10-26 (Phase 3 Step 1).** All 5 functions below are
now live on orbitworks-dev-ew (dev = 48 functions, matching source). Before
deploying, a read-only check of dev data showed their first runs would
change nothing: auto clock-out was off at every dev company, no clock photo
was 90+ days old, no deactivated employee qualified, and no company had
`planCanceledAt`. Prod was not touched (every prod function update time was
the same before and after).

The same day, `firestore:indexes` was deployed to dev too. Dev was missing 2
of the 13 indexes in `firestore.indexes.json`:
`companies (biometricPhotosWipedAt, planCanceledAt)` (needed by
`cleanupCanceledCompanyPhotos`) and `timesheetApprovals (employeeId, date)`.
Dev now has all 13. No index was deleted (no `--force`).

History: these functions exist in `functions/src` and are live on prod, but
were held back from the dev project on purpose until Phase 3, when we test
auto clock-out for employeeApp shifts.

Checked 2026-10-22: source had 46 functions, dev had 40. `acceptUpdatedTerms`
was deployed to dev the same day (terms re-accept prompt was failing with a
404), leaving these 5:

| Function | What it does | Why it's held |
|---|---|---|
| `runAutoClockOut` | Every 5 minutes, clocks out employees at companies with auto clock-out enabled once they pass the hour cap. | Runs on a schedule. `AUTO_CLOCK_OUT_ENABLED=true` in `functions/.env.orbitworks-dev-ew`, so it would start writing clock-outs to dev data right away. |
| `cleanupClockEventPhotos` | Every 24 hours, deletes clock-in/out verification photos 90 days after capture (or after a face alert is resolved). | Runs on a schedule and deletes files from dev Storage. |
| `cleanupDeactivatedEmployeePhotos` | Every 24 hours, deletes reference photos of deactivated employees (1 year after deactivation, or 3 years after last clock event). | Runs on a schedule and deletes files from dev Storage. |
| `cleanupCanceledCompanyPhotos` | Every 24 hours, deletes every biometric photo of a company 90 days after its subscription is canceled. | Runs on a schedule and deletes files from dev Storage. |
| `deleteEmployeesBulk` | Callable used by the billing downgrade flow: admin picks employee records to permanently delete (Auth + Firestore). | Permanent deletes. Not needed until we test downgrades. |

Deploy command (used 2026-10-26; PowerShell, from `orbitworks-web`):

```
$env:FUNCTIONS_DISCOVERY_TIMEOUT = "60"
npx firebase deploy --only "functions:runAutoClockOut,functions:cleanupClockEventPhotos,functions:cleanupDeactivatedEmployeePhotos,functions:cleanupCanceledCompanyPhotos,functions:deleteEmployeesBulk" --project orbitworks-dev-ew
```

The timeout variable is needed because the CLI's default 10 second code-load
limit times out on this codebase.

## Face data after a Pro -> Core downgrade (revised 2026-10-26)

The 2026-10-23 plan (delete each employee's `reference.jpg` and `selfie/`
folder after 90 days on Core, with a "dropped to Core at" timestamp) is
**replaced**. There is no new Pro-to-Core job:

- **The reference selfie STAYS on a downgrade.** It is the employee's
  profile picture. `reference.jpg`, the `selfie/` folder, `photoUrl` and
  `faceReference` are not deleted because a company moved to Core.
- On Core, face checks are already off (`isProCompany` gates in
  `rekognition.ts`), so nothing new is compared.
- Clock photos are already deleted 90 days after capture on every plan by
  `cleanupClockEventPhotos`. That covers a downgraded company too.
- Right-to-delete is separate and already immediate (`deleteEmployee`).

Phase 3 Step 6 (shrunk to this):
- When `cleanupClockEventPhotos` deletes a clock photo, mark the photo as
  removed on the clock event (not just clear `photoUrl`). Clock events,
  timestamps and face match results (match %, result, flags) are never
  deleted or changed.
- The website shows the match % and face result for that event with a
  "photo removed" placeholder instead of the image.

## Phase 3 to-do: flaky alerts test "maxHours fires via the periodic sweep" (found 2026-10-23)

- Symptom: `functions/test/alerts.test.js` "maxHours fires via the periodic
  sweep" failed in the full `npm test` run (125/126). It failed the same way
  on the commit before Employee App Phase 2 Part A, so Part A didn't cause it.
- Cause: it depends on the time of day. The test clocks in 9 hours before
  "now". The sweep in `alerts.ts` (`sweepCompany`, Max Hours block) only
  counts shifts whose clock-in is on today's date in America/Chicago
  (`localDateKey`). Run before 9:00 AM Central, the clock-in lands on
  yesterday and is skipped, so no alert is made. The failing run was at
  8:42 AM Central. The same test passed at 11:29 AM Central, alone and in
  the full alerts file.
- Not related to the 5 held functions above: the test only calls
  `checkPeriodicAlerts` (deployed on dev), and `alerts.ts` does not import
  `autoClockOut.ts`.
- Fixed 2026-10-26 (commit ccb0b90, test only - `alerts.ts` unchanged):
  the maxHours tests now freeze Date at fixed Chicago times (08:45 and
  15:00 fire; a shift from yesterday does not), so they pass at any hour.
  Phase 7 (2026-11-04): maxHours now counts from the shift's clock-in, so an
  overnight shift fires too (keyed to the clock-in day; day-shift ids unchanged).

## Phase 3 to-do: employeeApp in the clock-event trigger (found in Phase 1)

- Resolved 2026-10-26 (Phase 3 Step 3). The Phase 1 note above overstated
  it: the face check (`checkFaceMatch`) was never source-gated. It runs for
  every source with a clock photo, so `employeeApp` already gets it: Pro +
  clock photo + reference selfie = check; no selfie or Core = no check.
  Covered by `functions/test/clockEventSources.test.js`.
- Two branches ARE source-gated, and `employeeApp` stays out of both on
  purpose (decided 2026-10-26):
  - Auto site detection (Pro, source `pin` only). An `employeeApp` event's
    site is set when the punch is written (crew code site, else assigned
    site, else none), and detection would overwrite it. **Revisit in
    Employee App Phase 6 (location).**
  - Device tracking (`pin`/`faceMatch`/`supervisorOverride`). It tracks
    shared supervisor devices; an employee's own phone is not one.
- Auto clock-out (`runAutoClockOut`) and the periodic alert sweep do not
  filter by source, so they cover `employeeApp` shifts.

## Employee App to-dos (added 2026-10-23, Phase 2 Part B)

- **Move the old dev/test EAS profiles to the dev app ID.** `development`,
  `dev` and `preview` in `orbitworks-app/eas.json` still build the REAL
  bundle ID (`com.orbitworks.app`) against dev Firebase. The build guard
  (`orbitworks-app/config/envRules.js`) now FAILS those builds on EAS on
  purpose. Move each to `APP_VARIANT=dev` (`com.orbitworks.app.dev`) with
  its own non-production channel before building them again. Local
  `expo start` of the real app against dev still works (not a build).
  `previewStore` was removed (it uploaded dev builds to the real app's
  TestFlight).
- **"Join with crew code" MUST ship in the real app before the Phase 10
  release.** Today it only shows in OrbitsWorks Dev, because only that
  variant has `extra.joinLinks` (app.config.js) and a hosted domain serving
  the app link files. For the real app: add a prod `joinLinks` (prod URL +
  `orbitsworks://` scheme) in `config/envRules.js`, associated domains /
  intent filters for the prod domain, and set `APP_LINKS_IOS_APP_IDS`,
  `APP_LINKS_ANDROID_*` and `JOIN_APP_*` in `apphosting.yaml`.

## Release to-do: recheck selfies wrongly flagged "no usable face" (found 2026-10-27)

- **The bug (fixed on employee-app, live on dev, NOT on prod yet).**
  `checkFaceMatch` (functions/src/rekognition.ts) treated every
  `InvalidParameterException` from CompareFaces as "the reference selfie
  has no face". AWS also sends it when the CLOCK photo has no face. So a
  clock photo with no face marked the employee's selfie
  `faceReference: bad`, raised the persistent faceBadReference alert, and
  silently paused every later face check for that employee until the
  selfie changed. Found on dev on a real phone clock-out.
- **The fix.** On that error, DetectFaces decides which photo has no face:
  selfie with no face -> flagged as before; clock photo with no face ->
  `faceCheck: noFace` + faceNoFace alert on that punch, selfie untouched;
  both have a face or DetectFaces fails -> nothing written.
- **At release: prod may already have employees wrongly flagged.** Run a
  one-time recheck (not built yet): for every employee with
  `faceReference.status == "bad"` and `faceReference.photoUrl == photoUrl`,
  run DetectFaces on the selfie. Exactly 1 face -> delete `faceReference`
  and delete the `badref-{employeeId}` alert (same as
  `onEmployeePhotoWrite` does for a passing selfie). 0 or 2+ faces -> leave
  it. Report counts only. Pro companies only (Core never runs checks).

## Rule: dev matches prod (2026-11-02)

Dev (orbitworks-dev-ew) runs every function prod runs, with prod's
settings, plus the employee-app changes. Nothing new on dev may contradict
prod. Checked 2026-11-02 (read-only on prod): prod 45 functions, dev 59 -
all 45 on dev with the same triggers and schedules, the extra 14 are
employee-app. Settings: DEVICE_TRACKING_ENABLED and
PUSH_NOTIFICATIONS_ENABLED turned on for dev to match prod (they were off).
TEST_COMPANY_IDS stays empty on dev (every dev company is a test company).
Auto clock-out runs on dev every 5 minutes; it did nothing because every
dev company had it off - now on (12 h) for jc-test-pro-dev and
jc-test-core-dev.

## Fix on main before Phase 5 (decide first)

- **Prod TEST_COMPANY_IDS limits alerts AND auto clock-out to ShipMate**
  (found 2026-11-02, read-only). Prod's functions/.env.orbitworks-7ef59 has
  TEST_COMPANY_IDS=qdLsh075T743sGEKyZs7 (ShipMate, our own company).
  functions/src/autoClockOut.ts checks isCompanyInTestScope, so on prod
  only ShipMate gets auto clock-out, even when another company turns it on
  in Settings > Automations. The alerts feed is limited the same way. Fix
  on main (clear it, or stop autoClockOut using it), not on this branch.
  Not touched.

## Phase 10 to-do list (before the real release)

- **Company-time day edges on every website page** (Phase 9, H10 b). Day
  view, Timesheet Approvals, Reports, the Overview card and the Excel dates
  all cut days at midnight in the BROWSER's timezone (new Date(`${day}T00:00`)),
  while the server's alerts and auto clock-out use the company's
  (America/Chicago, functions/src/shared.ts). An admin outside Central time
  sees different day edges. Switch every website day edge to company time
  (employeeAppConfig.timezone / COMPANY_TIMEZONE) in one pass. Phase 9 only
  fixed the pairing (a shift crossing midnight now pairs).
- **Supervisor/admin invite seat check is not atomic** (noted Phase 9).
  acceptInvite (functions/src/company.ts) checks isOverActiveCap with a
  plain read before creating the employee, not in a transaction, so two
  invites accepted at the same moment for the last seat could both go
  through. Employee App invites (acceptEmployeeInvite) already re-check
  seats in a transaction.

- **App Store review note for "Always" location** (Phase 8). Explain in
  App Review notes: background location only while an employee is clocked
  in at a Pro company's geofenced job site, region monitoring only (no
  continuous tracking), to flag leaving the job site; a demo login with a
  geofenced site.
- **Google Play background location declaration + video** (Phase 8). The
  Play Console "Location permissions" declaration for
  ACCESS_BACKGROUND_LOCATION, with a short video of: clock in, the consent
  screen, the Always prompt, walking out, the notification.
- **Lawyer review of the new location consent and privacy text** (Phase 8).
  functions/src/consentVersions.ts (LOCATION_CONSENT_TEXT,
  LOCATION_CONSENT_VERSION), components/legal/PrivacyContent.tsx and
  EmployeeNoticeContent.tsx (r6). Any wording change = a version bump.
- **iOS force-quit behavior** (Phase 8, test-run-phase8.md O3). Confirm on
  a phone whether a region exit wakes the app after the employee swipes it
  away. If not: the exit is only seen when the app is next opened outside
  (or never, if they came back first) - decide whether to show a hint
  ("keep the app in the background while clocked in").
- **appStopped gap start is a best guess** (Phase 8). After a restart or a
  lost region, the gray "phone stopped tracking" gap starts at the later of
  the last time the phone was known to be tracking and the phone's boot
  (now - uptime). expo-device uptime pauses during sleep, so the boot time
  reads later than the real one and the gap can look shorter.
- **Android leave tracking** (Phase 8). Region-only, no foreground service.
  Android drops geofences on reboot and when the app is force-stopped; the
  app re-arms them (and records a gray gap) the next time it opens. Test
  with the Android build.

- **Prod TEST_COMPANY_IDS=ShipMate would limit Employee App alerts**
  (noted 2026-11-04, Phase 7). The employee's shift ending / still clocked
  in / max hours / overtime alerts are made by the periodic sweep
  (checkPeriodicAlerts), which skips every company outside
  isCompanyInTestScope. With prod's TEST_COMPANY_IDS=qdLsh075T743sGEKyZs7
  only ShipMate employees would get them. Decide at release (clear it, or
  gate only the supervisor feed). Not touched.
- **missedClockOut fires at midnight for overnight workers** (older issue,
  noted 2026-11-04, Phase 7). The sweep raises Missed Clock-Out for anyone
  whose latest event is not on today's date (alerts.ts, Missed Clock Out
  block), so a shift that crosses midnight gets one at 00:00 even though
  nobody missed anything. `missedClockOutMinutes` is not used by it. Phase
  7 did not change it (it now uses that delay only for the employee's
  "still clocked in"). Not touched.
- **Android push for the Employee App** (Phase 7, deferred). Android local
  break reminders work without it; server pushes (shift ending, still
  clocked in, max hours, overtime) and the employee token need:
  1. An Android app `com.orbitworks.app.dev` (and the prod package) in
     Firebase, `google-services.json` in orbitworks-app, and
     `android.googleServicesFile` in app.config.js per variant.
  2. An FCM V1 service-account key uploaded with
     `eas credentials -p android` for each package.
  3. Check that a date-trigger break reminder fires on time in Doze (no
     exact-alarm permission is asked; Android may deliver a few minutes
     late).
  Today `getExpoPushTokenAsync` fails on Android and registerEmployeePush
  just skips (no crash, no token).

- **Write temp link API tests** (added 2026-10-24). There are none today, in
  `functions/test` or `test/dev-e2e`. Cover `generateTempClockLink`,
  `listActiveTempClockLinks`, `listTempClockLinkHistory`,
  `revokeTempClockLink` and the public clock-in call: Pro only (Core gets
  403/permission-denied), expiry, revoke stops the link, 15 wrong PINs
  auto-revokes, history can't be edited or deleted. When the temp link moved
  under Crew Access (2026-10-24) it was checked by an empty `git diff` on its
  logic files plus a dev-site click-through instead.
- **"Join with crew code" in the real app** - see the Employee App to-dos
  above.
- **"Open in the app" on /j must not dead-end when the app isn't
  installed** (found 2026-10-24 on an iPhone). Today the button is a plain
  `orbitsworks-dev://j/{token}` link (components/join/JoinCodeLanding.tsx),
  so with no app Safari shows "cannot open the page because the address is
  invalid". It must fall back to the App Store / Google Play buttons and the
  install-then-rescan steps instead (for example: try the scheme, and if the
  page is still visible after a short wait, show the store options; or drop
  the button on iOS, where the universal link already opens the app).
- **Legal review of the sign-up consent text and the privacy policy**
  (decided 2026-10-24, for Employee App Phase 2 Part C). The privacy
  notice and the biometric (face photo) consent shown in the app sign-up
  flow, and the privacy policy they point to, must be reviewed by a lawyer
  before release. The versions live in
  `functions/src/consentVersions.ts`; any wording change after review means
  a version bump there.

- **Move the development/dev/preview EAS profiles to the dev app ID** -
  see the Employee App to-dos above.
- **Rate limit both join paths: QR (`joinCompany`, `getJoinInfo`) and
  email invite (`acceptEmployeeInvite`, `getInviteInfo`, Phase 3B).** All
  four are unauthenticated (`joinCompany` and `acceptEmployeeInvite` create
  Auth users). Before prod they need per-IP / per-token limits and App
  Check. Each has a `TODO(Phase 10): RATE LIMIT` marker at the top of its
  file (decided 2026-11-01: invites match QR for now, no limit yet).
- **Email invite duplicate check has no lock** (decided 2026-11-01, Phase
  3B). `createEmployeeInvite` / `resendEmployeeInvite`
  (functions/src/employeeInvites.ts) check "no other live invite for this
  email / this row" with plain queries, so two admins inviting the same
  email at the same instant could both get a pending invite. Sign-up stays
  safe (Firebase Auth allows one login per email; the second accept gets
  "email already in use"). Fix: a lock doc per company+email (and per row)
  written in the same transaction as the invite.
- **Find why EAS Updates don't reach the dev app** (found 2026-10-28).
  Update 01a1833d never showed on build 11; builds 10 and 11 are affected
  (channel employee-dev, runtime 1.1.2). Until fixed, JS changes for the dev
  app need a new build.
- **Face check missing on one clock-out** (found 2026-10-28, gate item 12).
  Dev, jc-test-pro-dev, Emilio Peguero (KfLB8nDz8lseZIhHEDch): the 10-27
  8:43 PM clock-out (event e43e4076-98d5-4089-bcff-29ef57f1f433) has no
  faceCheck field at all. It is from before a229a46. Include it in the
  face-check recheck.
- **Old lint error in `orbitworks-app/lib/hooks/useAlertsFeed.js`**
  (found 2026-10-29, Phase 4). `react-hooks/set-state-in-effect`: the
  effect calls `setAlerts([])` / `setLoading(false)` directly when there is
  no companyId. It was there before Phase 4; Phase 4 only touched the
  web-only alert filter in that file. Fix in the Phase 10 lint pass.
- **Unify the employee break site with main** (decided 2026-11-01, after
  merging main into employee-app). Main's supervisor breaks save no site,
  GPS or face check; Employee App breaks still copy the clock-in site.
  The website already shows "-" for break rows, so nothing looks wrong
  today. Make employee breaks match main.
- **Old app lint errors in files the main merge touched** (found
  2026-11-01). 19 errors, all present before the merge on main or
  employee-app: components/OfflineBanner.js, screens/LoadingScreen.js
  (react-hooks/refs); lib/AuthContext.js, lib/hooks/useHomeSnapshot.js,
  useLocalStatusOverlay.js, useSyncQueue.js, useTodayShift.js
  (set-state-in-effect / purity); screens/supervisor/SyncQueueScreen.js
  (unescaped quote). Fix in the Phase 10 lint pass with useAlertsFeed.js.
- **DONE in Phase 8 (90b1a05): old lint error in `orbitworks-app/lib/hooks/useLocationPermission.js`**
  (found 2026-11-03, Phase 5c). `react-hooks/set-state-in-effect`: the
  effect calls `refresh()` (which sets state) directly on mount. Not
  touched in Phase 5 (Settings reuses it as-is); the new
  useNotificationPermission.js avoids the pattern (state set only in the
  promise callback). Fix in the Phase 10 lint pass.
- **Re-auth Apple credentials in EAS before any release build** (found 2026-11-04, employeeDev build 20, 8e013d8): EAS got "Apple 401" and "Failed to fetch Apple provisioning profiles", skipped the check on Apple's servers and used its local check. Build and submit still worked. Run an interactive `eas credentials` / Apple login before the release builds.
- **DONE in Phase 9 (f80b570): old lint error in `orbitworks-web/lib/hooks/useClockEventsByDay.ts:28`** (found 2026-11-04, Phase 5 7d): `react-hooks/set-state-in-effect`, `setLoading(true)` / `setError("")` run directly in the effect; the new useShiftCommentsByClockIn.ts avoids it. Fix in the Phase 10 lint pass.
- **phoneClockOff only catches a clock set back** (decided 2026-11-01,
  fast punches ec726c0). The expected time uses expo-device uptime, which
  pauses while the phone sleeps, so it can only lag the real time and the
  check is one-sided (functions/src/employeeClockQueued.ts,
  isPhoneClockOff). A clock set AHEAD is not flagged - e.g. a padded
  offline clock-out that syncs after its fake time only gets the "Synced
  late" tag (the server's 2 min future limit only stops it if it syncs
  before that time). Fix: a small native module with a clock that keeps
  counting during sleep (iOS mach_continuous_time, Android
  SystemClock.elapsedRealtime) plus a boot id for restarts, then make the
  expected-time check two-sided. Needs a new build.
- **Phase 4 smoke tests not run at the Phase 4 close** (decided
  2026-11-01, fast close). The fast-close set (T2, T3, T5, T14, T16,
  S1-S6) moved to the first build of the next phase - see the Phase 5
  list. Still to run, from orbitworks-web/docs/phase4-test-checklist.md:
  T4 (weak signal, 2-min rule), T6 (queue pauses behind a failed punch),
  T7 (Remove a "Not recorded" punch), T8 (inactive while queued), T9
  (sign-out warning), T10 (late punch into an approved timesheet alert),
  T11 (badge + Sync Now), T12 (face check on smaller photos), T13
  ("after" timings) and T15 (phone clock set back -> phoneClockOff). T1
  (build 15 "before" timings) was skipped, so T13 has no T1 baseline:
  compare with the build 16 timings instead, or drop the comparison.
- **Duplicate "Emilio Peguero" employee** (found 2026-10-28). Dev,
  jc-test-pro-dev: GZ3DKAhivqjkAw04Md9T has no punches; the real one is
  KfLB8nDz8lseZIhHEDch. Find how the duplicate got created. Don't delete it
  until then.
- **Prod instance cap left over from old deploys** (found 2026-11-02).
  About 40 older prod functions have maxInstances 20; it isn't in our code
  (no maxInstances / setGlobalOptions anywhere), newer prod functions and
  all of dev have none. Decide whether to put a cap in code for all.
- **Stored PIN check value can be cracked off a phone** (decided
  2026-11-02, A1). The phone keeps a salted SHA-256 of the employee's own
  PIN in SecureStore. A 4-digit PIN has 10,000 options, so anyone who gets
  that value off an unlocked phone could find the PIN in seconds. The
  server still checks every punch. Same risk class as the supervisor
  app's pin_cache (unsalted SHA-256, SQLite).
- **Phone PIN lock resets on reinstall** (2026-11-02, L1). The 3-wrong /
  1-minute lock is saved in SecureStore, so a restart keeps it, but
  deleting the app clears it (they'd also need to sign in again).
- **Android assetlinks.json** (found 2026-11-01, Phase 3B step 7). The
  site serves no /.well-known/assetlinks.json, so on Android the https
  sign-up links (/j/ crew codes and /i/ email invites) open in the browser
  instead of the app, even though app.config.js has autoVerify intent
  filters for both. The page's "Open in the app" button still works. Add
  it (dev and prod package + signing cert fingerprints) before release.
- **The current PIN is plain text on the employee doc** (noted 2026-11-03,
  Phase 5 Redo removal). `companies/{c}/employees/{e}.pin` holds the 4
  digits as-is, and admins/owners can read it (the website's edit modal
  shows it). Employees can't (they read employeeSelfViews), and earlier
  PINs are already salted hashes in server-only employeePinHistory.
  Consider hashing it, or moving it to a server-only doc so the website
  shows "****" with a reset instead. Also used by verifyPin (query by pin),
  getPinSyncTable (supervisor app offline table) and the pins/{pin}
  uniqueness index - all need a plan before it changes.

## Phase 5 to-do (Hours)

- **Rerun on the first build of the next phase** (decided 2026-11-01,
  Phase 4 code-complete). Not run on build 17 (no results reported), so
  NOT marked OK: T2, T3, T5, T14, T16 and S1-S6 from
  orbitworks-web/docs/phase4-test-checklist.md. The first Phase 5 build
  carries the success overlay fix (ed39756: the green overlay covers
  before the screen behind changes) - check it on every T test. Dev-side
  note only: build 17 online punches (employee Rocio, 2026-11-01
  18:49-18:53 UTC) already landed with server time (0.1-0.8 s before
  createdAt) and no queued / syncedLate / phoneClockOff.

- **Wire the History tabs to real clock events** (decided 2026-10-29).
  `screens/employee/EmployeeHistoryScreen.js` and
  `EmployeeHistoryDayScreen.js` still use `MOCK_CLOCK_EVENTS` /
  `MOCK_HISTORY_EMPTY` from `lib/mockData.js`. Phase 4 leaves them on mock.
- **Wire Settings email, birthday and the Notifications / Location
  switches** (decided 2026-10-29). Still `MOCK_SETTINGS` in
  `EmployeeSettingsScreen.js`. Phase 4 only wires "Last synced", the PIN
  row ("****") and the sign-out warning.

## Phase 7 to-do (done 2026-11-04, code only - not deployed yet)

- **Wire the employee Alerts tab** - done. Real data
  (`lib/hooks/useEmployeeAlerts.js`: own employeeAlerts + this phone's
  fired break reminders); `lib/mockData.js` deleted.
- **Alert on the FIRST queued punch refused for a wrong PIN** - done.
  `SYNC_PIN_ALERT_AT = 1`, still one syncWrongPin per employee per day;
  the 5-in-24-h block is unchanged.
- Phone tests: `orbitworks-web/docs/test-run-phase7.md`, on the
  post-Phase-7 build together with test-run-phase6.md.
- **Deploy needs 3 parts** (dev only): functions (3 new:
  registerEmployeePushToken, clearEmployeePushToken, cleanupEmployeeAlerts;
  checkPeriodicAlerts changed), firestore rules (employeeAlerts
  isLinkedSelf, employeePushTokens) and firestore indexes (employeeAlerts
  composite + collection-group `token` overrides on employeePushTokens and
  pushTokens - registerEmployeePushToken needs them on a real project).

## Phase 8 (done 2026-11-05, code only - not deployed yet)

Leaving the job site (Pro, flag only). Design: header of
functions/src/employeeSiteExits.ts. Phone tests: test-run-phase8.md, on
the one combined build with test-run-phase6.md and test-run-phase7.md.

- **Deploy needs 4 parts** (dev only): firestore indexes (siteExits
  hasLocation + createdAt, for the 90-day cleanup), firestore rules
  (siteExits read by staff only, geofenceRadiusM server-only), functions
  (5 new: recordSiteExit, getShiftFence, cleanupSiteExitLocations,
  getLocationConsent, acceptLocationConsent; changed: employeeClockPunch,
  getEmployeeHomeSite, onClockEventCreated, alert code) and the dev
  website (Time Tracking lines, crew code geofence, Alerts toggle, legal
  text r6).
- **Owners see the Terms re-accept prompt** after the website deploy
  (TERMS_VERSION / PRIVACY_POLICY_VERSION 2026-11-04-r6). On prod this
  happens at release for every owner - expected.
- **Fixed in passing (lint, files touched):** orbitworks-app
  lib/hooks/useLocationPermission.js (set-state-in-effect - the Phase 10
  item below is done), orbitworks-web lib/hooks/useTimesheetApprovals.ts
  (set-state-in-effect), the four legal pages (unescaped quotes).

## Native changes queued for the one combined build (no build yet)

All ship together in the first build after Phase 8 (D18). Nothing below is
in any build on TestFlight today.
1. 87fda43 (Phase 6) - iOS when-in-use location text. Its "Never in the
   background" wording is REPLACED by 85dafec.
2. 1818442 (Phase 7) - expo-notifications plugin (brand color, default
   Android channel).
3. 85dafec (Phase 8) - expo-task-manager (new package), expo-location:
   isIosBackgroundLocationEnabled true (UIBackgroundModes location),
   isAndroidBackgroundLocationEnabled true (ACCESS_BACKGROUND_LOCATION),
   isAndroidForegroundServiceEnabled false, new while-using + Always text.
   Same binary as the supervisor app: the text shows there too, but only
   the employee login ever asks for Always.

## Phase 9 (done 2026-11-05, code only - not deployed yet)

Website catch-up. Website test run: test-run-phase9.md (no new phone
build). Both old Phase 9 items are done: leaving the job site in Reports,
Excel and an Overview card (H7, H8), and the possible-duplicate flag on the
Employees page with Dismiss (H4).

- **Deploy needs 3 parts** (dev only): firestore rules (the
  possible-duplicate fields are server-only), functions (1 new:
  dismissDuplicateFlag) and the dev website. No index changes.
- **Fixed in passing (lint, files touched):** lib/hooks/useClockEventsByDay.ts
  (the Phase 10 item below is done), lib/hooks/useReports.ts (manual memo),
  lib/reportExcelSheets.ts (any), components ApprovalsTable.tsx and the
  Reports page body (set-state-in-effect), the Overview page body
  (unescaped quotes).

## Phase 10 fix round 1 (done 2026-11-05, code only - not deployed yet)

From the dev test round. Plan + decisions (D1-D19, W8) in the round's
chat; tests in phase10-test-round.md section C5.

- **Deploy needs 3 parts** (dev only): functions (new: getMyPin; changed:
  employeeClockPunch, onClockEventCreated, listActiveTempClockLinks,
  listTempClockLinkHistory), the dev website, and a NEW APP BUILD (A1
  Settings, A2 Sync tab, A3 site filter, supervisor clock-in site guess).
  No rules change (pinReveals/{uid} is covered by the catch-all), no index
  change (alerts: single-field occurredAt; approvals: single-field date;
  temp links: the existing companyId + revoked + expiresAt index; shift
  site lookup: the existing employeeId + type + timestamp desc index).
- **Must fix before prod (D2 a): move the PIN off the employee doc** to a
  server-only doc (for example companies/{c}/employeePins/{employeeId}, no
  client read). The website PIN field, the supervisor PIN table
  (getPinSyncTable) and getMyPin (Settings "Show PIN") then read it through
  functions. Do NOT hash it: hashing breaks all three.
- **"Ask for job site each time" defaults to ON** (website App Settings,
  DEFAULT_APP_SETTINGS) - since this round the server keeps the
  supervisor's pick whenever it is on (D16 a), so a Pro company only gets
  supervisor-app detection after an admin turns it off. The Employee App
  still always detects on Pro (its half of D16 a is not built - open
  choice in the round's report).
- **W7 uncapped website fetches still open** (items 1 and 5 fixed this
  round: Overview alerts = last 30 days, max 200; Reports / Analytics
  approvals from the range start):
  - lib/hooks/useEmployeeInvites.ts: every Employee App invite ever
    (Employees page).
  - lib/hooks/useInvites.ts: every supervisor/admin invite ever (Employees
    page InviteManager).
  - lib/joinCodes/server.ts listJoinCodes: every crew code token ever (the
    Crew Access list pages 10 at a time from memory).
  - Grow with company size only: useReports + useSiteCosts (employees,
    jobs, sites, users), DevicesCard.tsx (users), useBillingPage (active +
    inactive employees), useDevices, useSubcontractors, useJobs, useSites,
    useEmployees (W3-W5 cap the display only, D8 a).
  - Date-bounded, no row cap: useClockEventsByDay, useSiteExitsByRange,
    useTimesheetApprovals, useEmployeeTimesheet.
- **Lint errors already there before this round** (files touched, not
  fixed - add to the Phase 10 lint pass): lib/hooks/useTempClockLinkPage.ts
  (set-state-in-effect on open), lib/hooks/useSiteCosts.ts (manual memo).
- **Removed:** orbitworks-app/lib/hooks/useMyJobSites.js (Settings was the
  only user).
