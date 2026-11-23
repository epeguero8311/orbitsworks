// isCoreOrProPlan (lib/stripe/tiers.ts) - gates the Employee App invite
// buttons on the Employees page (Phase 3B). Must match the server rule.
// Run via: node --test test/coreOrProPlan.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

// tiers.ts reads the Stripe price ids at load; dummy values are enough here.
for (const t of ["TIER1", "TIER2", "TIER3", "TIER4", "TIER5"]) {
  for (const p of ["", "CORE2_", "PRO_"]) process.env[`NEXT_PUBLIC_STRIPE_PRICE_${p}${t}`] ??= `price_test_${p}${t}`;
}
process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_TIER ??= "price_test_PRO";
const { isCoreOrProPlan } = await import("../lib/stripe/tiers.ts");

test("Core and Pro tiers can send invites", () => {
  for (const key of ["tier1", "tier5", "core2_tier1", "core2_tier5", "pro_tier1", "pro_tier5"]) assert.equal(isCoreOrProPlan(key), true, key);
});

test("free, custom, unknown and missing plans cannot", () => {
  for (const key of ["free", "custom", "bogus", "", undefined, null]) assert.equal(isCoreOrProPlan(key), false, String(key));
});
