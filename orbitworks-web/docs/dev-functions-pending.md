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
