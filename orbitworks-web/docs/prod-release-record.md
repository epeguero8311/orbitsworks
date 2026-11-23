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
| 5 | Functions (all) | |
| 6 | Data scripts (backfillEmployeeAppConfig, recheckBadFaceReferences, migrateEmployeePins copy) | |
| 7 | Password reset: custom domain off, real reset to the ShipMate login | |
| 8 | Staging App Hosting backend from `staging` | |
| 9 | Production EAS build to the prod app's TestFlight | |
| 10 | User tests on prod with ShipMate | |
