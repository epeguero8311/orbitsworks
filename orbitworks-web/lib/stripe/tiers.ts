export const PRICE_TIERS = [
  { key: "tier1", label: "Up to 15 employees", employeeCap: 15, priceId: "price_1U2zwLPsetz2ehJiFOQnfjM3", priceLabel: "$29/mo" },
  { key: "tier2", label: "Up to 25 employees", employeeCap: 25, priceId: "price_1U2zwLPsetz2ehJinm6gpv86", priceLabel: "$49/mo" },
  { key: "tier3", label: "Up to 50 employees", employeeCap: 50, priceId: "price_1U2zwLPsetz2ehJiFMhzdYFL", priceLabel: "$79/mo" },
  { key: "tier4", label: "Up to 75 employees", employeeCap: 75, priceId: "price_1U2zwMPsetz2ehJiYRSZFzf7", priceLabel: "$99/mo" },
  { key: "tier5", label: "Up to 100 employees", employeeCap: 100, priceId: "price_1U2zwMPsetz2ehJiBdO7S6DJ", priceLabel: "$129/mo" },
] as const;

export type PriceTierKey = typeof PRICE_TIERS[number]["key"];

export function getTierByKey(key: string) {
  return PRICE_TIERS.find((t) => t.key === key) ?? null;
}

export function getTierByPriceId(priceId: string) {
  return PRICE_TIERS.find((t) => t.priceId === priceId) ?? null;
}
