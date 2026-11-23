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

## Steps

| # | Step | Result |
|---|---|---|
| 1 | Live clients compat (emulator) | OK |
| 2 | Merge `employee-app` into local `main` (no push) | |
| 3 | Indexes + field overrides, wait for READY | |
| 4 | Rules (Firestore + Storage) | |
| 5 | Functions (all) | |
| 6 | Data scripts (backfillEmployeeAppConfig, recheckBadFaceReferences, migrateEmployeePins copy) | |
| 7 | Password reset: custom domain off, real reset to the ShipMate login | |
| 8 | Staging App Hosting backend from `staging` | |
| 9 | Production EAS build to the prod app's TestFlight | |
| 10 | User tests on prod with ShipMate | |
