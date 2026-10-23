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
