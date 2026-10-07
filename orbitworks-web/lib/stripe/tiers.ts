export type PlanProduct = "core" | "pro";

export interface PriceTier {
  key: string;
  product: PlanProduct;
  label: string;
  employeeCap: number;
  // Total employee *records* (active + inactive) the company may have at
  // once - a separate, looser limit than employeeCap (active only). null
  // means no total limit, which is what every grandfathered tier below
  // keeps (hidden: true) so existing subscribers are never newly
  // constrained by a dimension their plan never had.
  totalCap: number | null;
  priceId: string;
  priceLabel: string;
  // True for a tier that must stay resolvable (existing subscribers'
  // planTier still points at it, Stripe subscriptions still reference its
  // priceId) but must never be offered again - getTiersByProduct leaves it
  // out of the selectable list, getTierByKey/getTierByPriceId still find it.
  hidden?: boolean;
}

function requirePriceId(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing required env var ${name}. Set it in .env.local for local dev and in apphosting.yaml for production.`
    );
  }
  return value;
}

// Original Core tiers. Keys, env vars, and prices here must never change -
// existing subscribers have these exact keys stored as `planTier` in
// Firestore and Stripe subscriptions still reference these priceIds. Frozen
// as of the 2026 Core/Pro repricing (see CORE_TIERS_V2 below): hidden from
// the Plans page so no one can newly pick them, but still fully resolvable
// so current subscribers keep their original price and (uncapped) total
// forever, unless they actively switch plans.
const CORE_TIERS: PriceTier[] = [
  {
    key: "tier1",
    product: "core",
    label: "Up to 15 employees",
    employeeCap: 15,
    totalCap: null,
    hidden: true,
    priceId: requirePriceId(
      "NEXT_PUBLIC_STRIPE_PRICE_TIER1",
      process.env.NEXT_PUBLIC_STRIPE_PRICE_TIER1
    ),
    priceLabel: "$29/mo",
  },
  {
    key: "tier2",
    product: "core",
    label: "Up to 25 employees",
    employeeCap: 25,
    totalCap: null,
    hidden: true,
    priceId: requirePriceId(
      "NEXT_PUBLIC_STRIPE_PRICE_TIER2",
      process.env.NEXT_PUBLIC_STRIPE_PRICE_TIER2
    ),
    priceLabel: "$49/mo",
  },
  {
    key: "tier3",
    product: "core",
    label: "Up to 50 employees",
    employeeCap: 50,
    totalCap: null,
    hidden: true,
    priceId: requirePriceId(
      "NEXT_PUBLIC_STRIPE_PRICE_TIER3",
      process.env.NEXT_PUBLIC_STRIPE_PRICE_TIER3
    ),
    priceLabel: "$79/mo",
  },
  {
    key: "tier4",
    product: "core",
    label: "Up to 75 employees",
    employeeCap: 75,
    totalCap: null,
    hidden: true,
    priceId: requirePriceId(
      "NEXT_PUBLIC_STRIPE_PRICE_TIER4",
      process.env.NEXT_PUBLIC_STRIPE_PRICE_TIER4
    ),
    priceLabel: "$99/mo",
  },
  {
    key: "tier5",
    product: "core",
    label: "Up to 100 employees",
    employeeCap: 100,
    totalCap: null,
    hidden: true,
    priceId: requirePriceId(
      "NEXT_PUBLIC_STRIPE_PRICE_TIER5",
      process.env.NEXT_PUBLIC_STRIPE_PRICE_TIER5
    ),
    priceLabel: "$129/mo",
  },
];

function optionalTierV2(params: {
  key: string;
  product: PlanProduct;
  employeeCap: number;
  totalCap: number;
  priceId: string | undefined;
  priceLabel: string;
}): PriceTier | null {
  if (!params.priceId) return null;
  return {
    key: params.key,
    product: params.product,
    label: `${params.employeeCap} active / ${params.totalCap} total employees`,
    employeeCap: params.employeeCap,
    totalCap: params.totalCap,
    priceId: params.priceId,
    priceLabel: params.priceLabel,
  };
}

// 2026 Core repricing. New keys/new Stripe prices so CORE_TIERS above (and
// its existing subscribers' price/cap) never changes. Each tier only
// appears once its Stripe Price ID env var is set, same reasoning as
// PRO_TIERS below - lets this module deploy before that env var exists
// without crashing every page that imports it.
const CORE_TIERS_V2: PriceTier[] = [
  optionalTierV2({
    key: "core2_tier1",
    product: "core",
    employeeCap: 15,
    totalCap: 20,
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_CORE2_TIER1,
    priceLabel: "$49/mo",
  }),
  optionalTierV2({
    key: "core2_tier2",
    product: "core",
    employeeCap: 25,
    totalCap: 30,
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_CORE2_TIER2,
    priceLabel: "$79/mo",
  }),
  optionalTierV2({
    key: "core2_tier3",
    product: "core",
    employeeCap: 50,
    totalCap: 60,
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_CORE2_TIER3,
    priceLabel: "$129/mo",
  }),
  optionalTierV2({
    key: "core2_tier4",
    product: "core",
    employeeCap: 75,
    totalCap: 85,
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_CORE2_TIER4,
    priceLabel: "$159/mo",
  }),
  optionalTierV2({
    key: "core2_tier5",
    product: "core",
    employeeCap: 100,
    totalCap: 115,
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_CORE2_TIER5,
    priceLabel: "$199/mo",
  }),
].filter((t): t is PriceTier => t !== null);

// 2026 Pro tiers. Pro hasn't launched (no one has ever subscribed - see
// PRO_PLAN_ENABLED, which in production today is false because every
// NEXT_PUBLIC_STRIPE_PRICE_PRO_TIER* env var is still unset), so unlike
// Core there's no grandfathered set to preserve: these keys/env vars are
// simply repointed at new Stripe prices with the new amounts and total
// caps. Each tier only appears once its env var is set, so this module
// (bundled client-side via PlansList) doesn't crash every page that
// imports it before that's done.
//
// Lookups below use static `process.env.NEXT_PUBLIC_*` member expressions
// (not a dynamic key) on purpose: Next.js only inlines NEXT_PUBLIC_ vars
// into the client bundle when it can statically see the literal name.
const PRO_TIERS: PriceTier[] = [
  optionalTierV2({
    key: "pro_tier1",
    product: "pro",
    employeeCap: 15,
    totalCap: 20,
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_TIER1,
    priceLabel: "$79/mo",
  }),
  optionalTierV2({
    key: "pro_tier2",
    product: "pro",
    employeeCap: 25,
    totalCap: 30,
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_TIER2,
    priceLabel: "$119/mo",
  }),
  optionalTierV2({
    key: "pro_tier3",
    product: "pro",
    employeeCap: 50,
    totalCap: 60,
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_TIER3,
    priceLabel: "$199/mo",
  }),
  optionalTierV2({
    key: "pro_tier4",
    product: "pro",
    employeeCap: 75,
    totalCap: 85,
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_TIER4,
    priceLabel: "$249/mo",
  }),
  optionalTierV2({
    key: "pro_tier5",
    product: "pro",
    employeeCap: 100,
    totalCap: 115,
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_TIER5,
    priceLabel: "$299/mo",
  }),
].filter((t): t is PriceTier => t !== null);

export const PRICE_TIERS: PriceTier[] = [...CORE_TIERS, ...CORE_TIERS_V2, ...PRO_TIERS];

export const PRO_PLAN_ENABLED = PRO_TIERS.length > 0;

export function getTierByKey(key: string): PriceTier | null {
  return PRICE_TIERS.find((t) => t.key === key) ?? null;
}

export function getTierByPriceId(priceId: string): PriceTier | null {
  return PRICE_TIERS.find((t) => t.priceId === priceId) ?? null;
}

// Selectable tiers, plus the caller's own current tier even if it's hidden
// (grandfathered) - so a legacy subscriber's Plans list still shows which
// tier they're on (PlansList's isCurrent/disabled "Current plan" button),
// without making any OTHER hidden tier newly choosable. currentPlanTier is
// optional only so existing non-billing callers don't need it.
export function getTiersByProduct(product: PlanProduct, currentPlanTier?: string): PriceTier[] {
  return PRICE_TIERS.filter(
    (t) => t.product === product && (!t.hidden || t.key === currentPlanTier)
  );
}

// Central check for gating a Pro-only feature. "free" and "custom" plans
// (and any unrecognized/missing planTier) are never Pro.
export function isProPlan(planTier: string | undefined | null): boolean {
  if (!planTier) return false;
  return getTierByKey(planTier)?.product === "pro";
}
