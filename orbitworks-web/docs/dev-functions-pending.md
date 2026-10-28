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

## Phase 10 to-do list (before the real release)

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
- **Rate limit `joinCompany` and `getJoinInfo`.** Both are unauthenticated
  (`joinCompany` creates Auth users). `joinCompany` has a
  `TODO(Phase 10): RATE LIMIT` marker at the top of
  `functions/src/joinCompany.ts`; `getJoinInfo` (Part C) gets the same.

## Phase 9 to-do

- **Duplicate sign-up flag** (decided 2026-10-24, Phase 2 Part C). Flagging
  a crew code sign-up that may duplicate an existing employee, shown on
  the Employees page, is NOT built in Part C. It waits for Phase 9.
