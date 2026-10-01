import { defineBoolean, defineString } from "firebase-functions/params";

// Both default OFF. Alert generation and push sending must ship inert -
// every check in alerts.ts/pushSend.ts reads these before doing anything,
// so a deploy with these unset changes zero behavior for clock events.
// Flip order for a safe rollout: ALERTS_FEED_ENABLED first, verify alert
// docs are being written correctly, then PUSH_NOTIFICATIONS_ENABLED.
export const ALERTS_FEED_ENABLED = defineBoolean("ALERTS_FEED_ENABLED", { default: false });
export const PUSH_NOTIFICATIONS_ENABLED = defineBoolean("PUSH_NOTIFICATIONS_ENABLED", { default: false });

// Optional testing scope, applied on top of ALERTS_FEED_ENABLED. Empty
// (the default) means no restriction - every company gets alerts once the
// master switch is on, same as if this didn't exist. Set to a
// comma-separated list of companyIds to restrict alert generation to just
// those companies while testing, so flipping the master switch on doesn't
// immediately affect every real customer. Remove/clear this once testing
// is done - it's a temporary safety net, not a permanent feature.
export const TEST_COMPANY_IDS = defineString("TEST_COMPANY_IDS", { default: "" });

export function isCompanyInTestScope(companyId: string): boolean {
  const raw = TEST_COMPANY_IDS.value().trim();
  if (!raw) return true;
  const allowed = raw.split(",").map((id) => id.trim()).filter(Boolean);
  return allowed.length === 0 || allowed.includes(companyId);
}
