export type PlanProduct = "core" | "pro";

export interface PriceTier {
  key: string;
  product: PlanProduct;
  label: string;
  employeeCap: number;
  priceId: string;
  priceLabel: string;
}

function requirePriceId(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing required env var ${name}. Set it in .env.local for local dev and in apphosting.yaml for production.`
    );
  }
  return value;
}

// Core tiers are the original (and, until Pro ships, only) plan. Keys,
// env vars, and prices here must never change - existing subscribers have
// these exact keys stored as `planTier` in Firestore, and Core pricing is
// grandfathered as-is even after Pro launches.
const CORE_TIERS: PriceTier[] = [
  {
    key: "tier1",
    product: "core",
    label: "Up to 15 employees",
    employeeCap: 15,
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
    priceId: requirePriceId(
      "NEXT_PUBLIC_STRIPE_PRICE_TIER5",
      process.env.NEXT_PUBLIC_STRIPE_PRICE_TIER5
    ),
    priceLabel: "$129/mo",
  },
];

function optionalTier(params: {
  key: string;
  product: PlanProduct;
  employeeCap: number;
  priceId: string | undefined;
  priceLabel: string;
}): PriceTier | null {
  if (!params.priceId) return null;
  return {
    key: params.key,
    product: params.product,
    label: `Up to ${params.employeeCap} employees`,
    employeeCap: params.employeeCap,
    priceId: params.priceId,
    priceLabel: params.priceLabel,
  };
}

// Pro tiers, ~60% premium over the matching Core tier. Each one only
// appears in PRICE_TIERS once its Stripe Price ID env var is set - Pro
// hasn't launched yet, so most environments won't have these configured,
// and this module (bundled client-side via PlansList) must not crash
// every page that imports it just because Pro isn't live there yet.
//
// Lookups below use static `process.env.NEXT_PUBLIC_*` member expressions
// (not a dynamic key) on purpose: Next.js only inlines NEXT_PUBLIC_ vars
// into the client bundle when it can statically see the literal name.
const PRO_TIERS: PriceTier[] = [
  optionalTier({
    key: "pro_tier1",
    product: "pro",
    employeeCap: 15,
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_TIER1,
    priceLabel: "$49/mo",
  }),
  optionalTier({
    key: "pro_tier2",
    product: "pro",
    employeeCap: 25,
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_TIER2,
    priceLabel: "$79/mo",
  }),
  optionalTier({
    key: "pro_tier3",
    product: "pro",
    employeeCap: 50,
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_TIER3,
    priceLabel: "$129/mo",
  }),
  optionalTier({
    key: "pro_tier4",
    product: "pro",
    employeeCap: 75,
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_TIER4,
    priceLabel: "$159/mo",
  }),
  optionalTier({
    key: "pro_tier5",
    product: "pro",
    employeeCap: 100,
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_TIER5,
    priceLabel: "$199/mo",
  }),
].filter((t): t is PriceTier => t !== null);

export const PRICE_TIERS: PriceTier[] = [...CORE_TIERS, ...PRO_TIERS];

export const PRO_PLAN_ENABLED = PRO_TIERS.length > 0;

export function getTierByKey(key: string): PriceTier | null {
  return PRICE_TIERS.find((t) => t.key === key) ?? null;
}

export function getTierByPriceId(priceId: string): PriceTier | null {
  return PRICE_TIERS.find((t) => t.priceId === priceId) ?? null;
}

export function getTiersByProduct(product: PlanProduct): PriceTier[] {
  return PRICE_TIERS.filter((t) => t.product === product);
}
