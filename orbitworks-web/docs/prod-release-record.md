# Prod release record: Employee App release (dry run)

- **Code:** build 31's code, `employee-app` @ `570ca77` (tree `6fe35f49c1cb`).
- **Prod project:** `orbitworks-7ef59`.
- **Started:** 2026-11-22. The user tests on prod with ShipMate (staging site + prod TestFlight build). Go-live (push `main`, Apple submit) is a separate OK.

## Open at start

- **RC1 is OPEN** (role change while signed in; build 29 FAIL). It stays open until the green screens are explained (Drops Sync Queue screenshot pending). The dry run goes ahead with it open, by the user's decision on 2026-11-22.

## Prod before the dry run (read 2026-11-22)

- **Website:** App Hosting `orbitsworks-backend`, auto-rollout from `main` @ `5fd9898`.
- **Rules:**
  - Firestore ruleset `9685428f-d935-45c1-80a7-7b13641c58c2` (2026-11-14) is the same as `main`.
  - Storage ruleset `977d9d5f-8e51-4c7b-8e96-9c8a14901305` (2026-08-12) is the same as `main`.
- **Functions:** 45, all present in the code. The release adds 29 and deletes none.
- **Indexes:** 13 composite.
  - Missing: `employeeInvites(companyId, createdAt)`, `employeeAlerts(employeeId, createdAt desc)` and `siteExits(hasLocation, createdAt)`.
  - Missing field overrides: `employeePushTokens.token`, `pushTokens.token`, and the TTL on `publicRateLimits.expiresAt`.
- **Auth email:** the custom domain `orbitsworks.com` is half-set: `useCustomDomain: true`, `customDomainState: NOT_STARTED`.

## Step 1: live clients against the new backend (emulator, 2026-11-22)

- **`main`'s own tests run against the new rules and functions:** 99 of 104 pass. The 5 that fail are all intended changes:
  - 2 × the TEST_COMPANY_IDS gate is gone, so alerts go to every company.
  - 2 × a no-face clock photo no longer flags the reference selfie.
  - 1 × an admin client can't create an employee doc with `pin`. No live client does that.
- **`functions/test/liveClientsCompat.test.js`:** every Firestore call the 1.1.4 supervisor app and the live website make, with their exact payloads.
  - New rules: 12/12 pass.
  - `main`'s rules: 10/12. The one difference is that a subcontractor delete is refused now.
- **Storage rules:** non-employee roles are unchanged; only `&& !isEmployeeRole()` was added. Checked by diff, not by emulator.

## Rollback material

- **Old prod functions env** (has `TEST_COMPANY_IDS`, so alerts go to ShipMate only), for the step 5 rollback: `C:\Users\Epegu\orbitworks-rollback\rollback.env.orbitworks-7ef59`. It is outside the repo and not committed.
- **Old code for a functions rollback:** `5fd9898` (the old `main`).
- **Old rulesets:** Firestore `9685428f-d935-45c1-80a7-7b13641c58c2`, Storage `977d9d5f-8e51-4c7b-8e96-9c8a14901305`.

## Steps

| # | Step | Result |
|---|---|---|
| 1 | Live clients compat (emulator) | OK |
| 2 | Merge `employee-app` into local `main` (no push) | OK: `eabf7fd` pushed to `employee-app`. Local `main` merge `86c5258` has the same tree as `eabf7fd` and is not pushed. The prod env check and `tsc` pass. |
| 3 | Indexes + field overrides, wait for READY | OK: deployed 2026-11-22, no deletes. All 16 composite indexes READY, the `token` overrides on `employeePushTokens` and `pushTokens` (COLLECTION + COLLECTION_GROUP) READY, and the TTL on `publicRateLimits.expiresAt` ACTIVE. |
| 4 | Rules (Firestore + Storage) | OK: deployed 2026-11-23 21:34 UTC. New rulesets: Firestore `cc0393d4-f056-41f2-8fb8-4422f8711050`, Storage `a0a44424-528a-4b35-b4ca-aef39c65f787`. Read back from prod, they are the same as the repo files (md5 with line endings ignored). `liveClientsCompat.test.js` against the deployed Firestore rules: 14/14, including the new page-load test for the live Employees, Time Tracking and Reports pages (admin + owner). Sentry: no permission errors in the 2 h after the deploy. |
| 5 | Functions (all) | OK: deployed 2026-11-23 22:17-22:20 UTC from local `main` `86c5258`, after the customer warning and the AWS opt-out. Checked first: auto clock-out is on only for ShipMate and Murphy Foundation (`enabled: true`, `maxWorkedHours` 12, a number). It was already running for both on prod; the other 5 companies never set it. Results: 74 functions ACTIVE, all on a revision from this deploy, none with `TEST_COMPANY_IDS`; Cloud Run `maxScale` 20 on all 75 services. The deploy hit Cloud Run "write requests per minute" quota errors; the CLI retried and all 74 succeeded. No other errors in the logs or Sentry. `runAutoClockOut` and `checkPeriodicAlerts` ran on the new revisions with status 200. 15 min watch (22:22-22:38 UTC): 0 new alerts and 0 push warnings, because no company punched in that window (Murphy Foundation's last punch was 21:58 UTC). No real alert or push has been seen on prod yet. |
| 6 | Data scripts (backfillEmployeeAppConfig, recheckBadFaceReferences, migrateEmployeePins copy) | OK, 2026-11-23, each a dry run then `--apply --confirm-prod`, then a dry-run re-check. **a** backfillEmployeeAppConfig: 7/7 companies written (2 Pro); re-check 7 already current. **b** recheckBadFaceReferences: 1 cleared (ShipMate `i2Wp0nUUoNUAx4JxE5edRmozoZu1`, flagged 11/06 `InvalidParameterException`, 1 face) and its badref alert resolved; re-check 0 flagged. The state before, for rollback, is in `C:\Users\Epegu\orbitworks-rollback\step6b-before-apply-i2Wp0nUUoNUAx4JxE5edRmozoZu1.json` (+ the dry-run and apply output there). **c** migrateEmployeePins COPY only: 75/76 copied (1 has no PIN); re-check 75 already copied, 0 different. `--strip` NOT run (see step 12). The apply output is in the same folder. |
| 7 | Password reset: custom domain off, real reset to the ShipMate login | 7a OK, 2026-11-23: `notification.sendEmail.dnsInfo.useCustomDomain` set to false (read back: field gone = false, `customDomain` still recorded, `customDomainState: NOT_STARTED`). Emails now come from the default `noreply@orbitworks-7ef59.firebaseapp.com`. 7b (real reset to the ShipMate login): waiting for the user. |
| 8 | Staging App Hosting backend from `staging` | SKIPPED by the user (2026-11-23): smoke test on the live site instead. The `staging` branch was pushed at `86c5258`, then deleted from origin and locally; no backend ever used it. |
| 9 | Production EAS build to the prod app's TestFlight | OK, 2026-11-23. Build 37 (`bdcfa5bc`) ERRORED: the App Store provisioning profile had no Associated Domains. The user ran an interactive build: capability synced, profile `3CFA35FA3W` regenerated. **Build 38** (`89f4ff14-93e5-493f-8783-9cb4efdc7c83`, production profile, commit `86c5258`) was checked from the IPA itself: Info.plist `com.orbitworks.app` 1.1.5 (38); embedded config `appVariant: prod`, `applinks:orbitsworks.com`; build log env `EXPO_PUBLIC_FIREBASE_ENV=prod`, `EXPO_PUBLIC_BUILD_PROFILE=production` (prod maps to `orbitworks-7ef59` in `config/envRules.js` and `lib/firebase.js`; both guard against anything else). Uploaded to TestFlight of ASC 6801155800 (submission `97d3ad1c-a060-4d78-b970-614fa3c8764f`). Not submitted for review. |
| 10 | User tests on prod with ShipMate | |
| 11 | Go-live: push `main` (App Hosting rolls out the new website to orbitsworks.com), submit to Apple with manual release | **11a OK:** local `main` merged `employee-app` again (`359fa80`, docs/tests/scripts only since `86c5258`) and was pushed `5fd9898..359fa80` at 23:29 UTC. `rollout-2026-11-23-001` SUCCEEDED; `build-2026-11-23-001` (commit `359fa80`) serves 100% by 23:34 UTC. Checks: AASA 200 JSON with `6ZU7MHT284.com.orbitworks.app` for `/j/*` and `/i/*`; `/i/<fake>` and `/j/<fake>` render "no longer active"; `/login`, `/forgot-password`, `/dashboard` 200; 0 errors in Sentry and the prod logs. Rollback (validated with validateOnly): a rollout of `build-2026-11-14-001`. **11b (Apple submit):** waits for RC1 to close. |
| 12 | **REQUIRED after go-live:** strip the plain PIN from employee docs | |

## Step 12: strip the plain PIN from employee docs (REQUIRED, not optional)

This is on the must-fix-before-launch list. Until it runs, every admin and supervisor of a company can read employees' plain PINs from `employees/{id}.pin`, the same as before this release. After step 6c, the PIN also lives in the server-only `employeePins/{id}` (rules: `allow read, write: if false`).

**When:** right after step 11, once orbitsworks.com serves the new website. The new site reads PINs through `getEmployeePins`. The old site reads `employees.pin`, so running this earlier would show "-" for every PIN on the live site. The 1.1.4 app is not affected: it gets PINs only through `getPinSyncTable`, which reads `employeePins` first.

**Commands** (in order, each with the user's OK, printing `PROJECT: orbitworks-7ef59` first):

1. In `C:\Users\Epegu\orbitworks\orbitworks-web\functions\.env.orbitworks-7ef59`, set `EMPLOYEE_DOC_PIN_REMOVED=true`. This is a tracked file, so commit the change. Then deploy the functions, so the server stops writing the PIN back to the employee doc:
   ```
   cd C:\Users\Epegu\orbitworks\orbitworks-web
   firebase deploy --only functions --project orbitworks-7ef59 --non-interactive
   ```
2. Strip dry run:
   ```
   cd C:\Users\Epegu\orbitworks\orbitworks-web\functions
   node scripts/migrateEmployeePins.js --project orbitworks-7ef59 --strip
   ```
3. Strip apply:
   ```
   node scripts/migrateEmployeePins.js --project orbitworks-7ef59 --strip --apply --confirm-prod
   ```

Before step 3, run the copy dry run again (`node scripts/migrateEmployeePins.js --project orbitworks-7ef59`); it must show `wouldCopy: 0`. After step 3, the strip dry run must find nothing left to strip.

**Rollback:** set `EMPLOYEE_DOC_PIN_REMOVED=false` and redeploy the functions FIRST (otherwise the server deletes the field again on the next PIN change). Then copy every PIN back with `functions/scripts/restoreEmployeePins.js` (employeePins -> employees.pin; it leaves a different PIN alone unless `--include-different`):
```
cd C:\Users\Epegu\orbitworks\orbitworks-web\functions
node scripts/restoreEmployeePins.js --project orbitworks-7ef59
node scripts/restoreEmployeePins.js --project orbitworks-7ef59 --apply --confirm-prod
```
The script was tested in the emulator on 2026-11-23: restore missing, skip same, leave different (and overwrite with `--include-different`), skip no-PIN, re-run clean, and the prod guard refuses `--apply` without `--confirm-prod`. The prod dry run before the strip, 2026-11-23: `{"companies":7,"employees":76,"noPinDoc":1,"alreadyThere":75,"wouldRestore":0,"different":0}`.

## Post-launch TODO (not on go-live night)

- **Custom email domain:** verify `orbitsworks.com` as the Firebase Auth email domain (Console > Authentication > Templates > customize domain: add the DNS records it gives, wait for verification), so reset and verification emails come from our domain. Then set `notification.sendEmail.dnsInfo.useCustomDomain` back to `true` on `orbitworks-7ef59` and send a real reset to check. It was set to `false` in step 7a because the domain was never verified (`customDomainState: NOT_STARTED`).
- **Android Employee App plan:** Android employees have no Employee App yet. The newest Android build is 1.1.3 vc12, with no employee sign-in. The join and invite pages say "install from the App Store", and there is no `assetlinks.json`, so Android App Links are off. A plan is needed for: an Android 1.1.5+ production build, Play internal test, then release; the Play signing certificate in `assetlinks.json` (`APP_LINKS_*`); and Android wording/links on the /i and /j pages. Until then, customers must not invite Android employees.
