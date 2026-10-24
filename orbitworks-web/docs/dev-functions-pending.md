# Dev functions not yet deployed (orbitworks-dev-ew)

These functions exist in `functions/src` and are live on prod, but are held
back from the dev project on purpose. Deploy them in **Phase 3**, when we test
auto clock-out for employeeApp shifts.

Checked 2026-10-22: source has 46 functions, dev had 40. `acceptUpdatedTerms`
was deployed to dev the same day (terms re-accept prompt was failing with a
404), leaving these 5:

| Function | What it does | Why it's held |
|---|---|---|
| `runAutoClockOut` | Every 5 minutes, clocks out employees at companies with auto clock-out enabled once they pass the hour cap. | Runs on a schedule. `AUTO_CLOCK_OUT_ENABLED=true` in `functions/.env.orbitworks-dev-ew`, so it would start writing clock-outs to dev data right away. |
| `cleanupClockEventPhotos` | Every 24 hours, deletes clock-in/out verification photos 90 days after capture (or after a face alert is resolved). | Runs on a schedule and deletes files from dev Storage. |
| `cleanupDeactivatedEmployeePhotos` | Every 24 hours, deletes reference photos of deactivated employees (1 year after deactivation, or 3 years after last clock event). | Runs on a schedule and deletes files from dev Storage. |
| `cleanupCanceledCompanyPhotos` | Every 24 hours, deletes every biometric photo of a company 90 days after its subscription is canceled. | Runs on a schedule and deletes files from dev Storage. |
| `deleteEmployeesBulk` | Callable used by the billing downgrade flow: admin picks employee records to permanently delete (Auth + Firestore). | Permanent deletes. Not needed until we test downgrades. |

Deploy command when we get there (PowerShell, from `orbitworks-web`):

```
$env:FUNCTIONS_DISCOVERY_TIMEOUT = "60"
npx firebase deploy --only "functions:runAutoClockOut,functions:cleanupClockEventPhotos,functions:cleanupDeactivatedEmployeePhotos,functions:cleanupCanceledCompanyPhotos,functions:deleteEmployeesBulk" --project orbitworks-dev-ew
```

The timeout variable is needed because the CLI's default 10 second code-load
limit times out on this codebase.

## Phase 3 to-do: face data after a Pro -> Core downgrade (decided 2026-10-23)

Decision: **freeze, then delete after 90 days on Core.** Build this in
`cleanupCanceledCompanyPhotos` (or a sibling) when the held functions get
deployed:

- On Core, face checks are already off (`isProCompany` gates in
  `rekognition.ts`) and nothing new is enrolled - that is the freeze.
- After 90 days continuously on Core, delete every employee's
  `reference.jpg` **and** `selfie/signup.jpg` (the whole `selfie/` folder),
  clear `photoUrl`/`faceReference`, and stamp the employee's
  `employeeConsents/{employeeId}` record with `faceDataDeletedAt` and
  `faceDataDeletedReason: "coreDowngrade"`. Never delete the consent record.
- Upgrading back to Pro inside the 90 days keeps everything.
- Log each deletion: employeeId, what was deleted (file names only), when,
  and why. No face data, no names, no URLs/tokens in the log.
- Needs a "dropped to Core at" timestamp on the company doc from the Stripe
  webhook to count the 90 days from.
- Right-to-delete is separate and already immediate (`deleteEmployee`).

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
- Fix (not done yet): pin "now" in the test to midday Central (or clock in a
  few hours ago with a lower `maxHoursThreshold`), so it passes at any hour.

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
- **Legal review of the sign-up consent text** (decided 2026-10-24, for
  Employee App Phase 2 Part C). The privacy notice and the biometric
  (face photo) consent shown in the app sign-up flow must be reviewed by a
  lawyer before release. The versions live in
  `functions/src/consentVersions.ts`; any wording change after review means
  a version bump there.

## Phase 9 to-do

- **Duplicate sign-up flag** (decided 2026-10-24, Phase 2 Part C). Flagging
  a crew code sign-up that may duplicate an existing employee is NOT
  built in Part C. It waits for Phase 9.
