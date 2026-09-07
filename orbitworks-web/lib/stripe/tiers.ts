function requirePriceId(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing required env var ${name}. Set it in .env.local for local dev and in apphosting.yaml for production.`
    );
  }
  return value;
}

export const PRICE_TIERS = [
  {
    key: "tier1",
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
    label: "Up to 100 employees",
    employeeCap: 100,
    priceId: requirePriceId(
      "NEXT_PUBLIC_STRIPE_PRICE_TIER5",
      process.env.NEXT_PUBLIC_STRIPE_PRICE_TIER5
    ),
    priceLabel: "$129/mo",
  },
] as const;

export type PriceTierKey = typeof PRICE_TIERS[number]["key"];

export function getTierByKey(key: string) {
  return PRICE_TIERS.find((t) => t.key === key) ?? null;
}

export function getTierByPriceId(priceId: string) {
  return PRICE_TIERS.find((t) => t.priceId === priceId) ?? null;
}
