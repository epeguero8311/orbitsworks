# Prod alerts gate (TEST_COMPANY_IDS)

## Open item

prod TEST_COMPANY_IDS still limits all alerts + pushes to ShipMate; real
companies get none. Decide separately how to turn them on (all at once vs
per company).

- Where: `orbitworks-web/functions/.env.orbitworks-7ef59` (gitignored),
  `TEST_COMPANY_IDS=qdLsh075T743sGEKyZs7` (ShipMate).
- Code: `isCompanyInTestScope()` in `orbitworks-web/functions/src/flags.ts`,
  called by every alert path in `functions/src/alerts.ts` (late clock-in,
  early clock-out, outside geofence, site mismatch, face alerts, employee
  updated, and the 15-min sweep: max hours, overtime, missed clock-out,
  break too long).
- Note: every alert type defaults to ON (`ALERT_SETTINGS_DEFAULTS`), so
  clearing the gate sends alerts + pushes to every company right away,
  even ones that never opened Settings.

## Done (2026-11-02 hotfix)

Auto clock-out is no longer limited by TEST_COMPANY_IDS. Any company with
it on in Settings > Automations gets it; the per-company toggle is the
gate. A phone/offline punch still wins (`functions/src/clockEvents.ts`).
Tests: `orbitworks-web/functions/test/autoClockOut.test.js`.

At deploy time only ShipMate and Murphy Foundation (5e5FoWXZ9DEHfW3oPnHz)
had it on (12 h each), with no open shifts past the cap.
