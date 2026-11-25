import { defineBoolean } from "firebase-functions/params";

// Both default OFF. Alert generation and push sending must ship inert -
// every check in alerts.ts/pushSend.ts reads these before doing anything,
// so a deploy with these unset changes zero behavior for clock events.
// Flip order for a safe rollout: ALERTS_FEED_ENABLED first, verify alert
// docs are being written correctly, then PUSH_NOTIFICATIONS_ENABLED.
export const ALERTS_FEED_ENABLED = defineBoolean("ALERTS_FEED_ENABLED", { default: false });
export const PUSH_NOTIFICATIONS_ENABLED = defineBoolean("PUSH_NOTIFICATIONS_ENABLED", { default: false });

// Auto Clock-Out (functions/src/autoClockOut.ts) - its own kill switch,
// independent of ALERTS_FEED_ENABLED (that one only gates the informational
// alerts/push system; this one gates writing real clock events on real
// shifts, so it gets its own rollout safety rail). Each company also has
// its own autoClockOut.enabled toggle (Settings > Automations); the sweep
// requires both to be true before touching anything, so flipping this on
// is still safe with every company's own toggle left off. On each project
// the live value is the line in functions/.env.<project> (tracked; the
// predeploy check refuses a deploy without it), not this `default`.
export const AUTO_CLOCK_OUT_ENABLED = defineBoolean("AUTO_CLOCK_OUT_ENABLED", { default: true });

// TEST_COMPANY_IDS (a temporary per-company allowlist for alerts/pushes
// while they were tested on ShipMate) was removed 2026-11-14: every company
// now gets alerts and pushes, subject only to the switches above and each
// company's own Settings > Alerts toggles. A leftover TEST_COMPANY_IDS line
// in a functions/.env.<project> file is ignored.

// Task 5 Kiosk mode (K3). OFF = no kiosk logins can be made: setEmployeeRole
// and acceptInvite refuse the kiosk role and every kiosk callable refuses.
// Stays OFF on prod until the 1.1.6 app (the first with Kiosk mode) is in
// the App Store - an older app would open a kiosk login in the supervisor
// screens (with no access - firestore.rules K9). Live value = the line in
// functions/.env.<project>.
export const KIOSK_ENABLED = defineBoolean("KIOSK_ENABLED", { default: false });
