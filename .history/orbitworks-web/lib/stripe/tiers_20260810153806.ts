export const PRICE_TIERS = [
  { key: "tier1", label: "1-15 employees", employeeCap: 15, priceId: "price_1U2zwLPsetz2ehJiFOQnfjM3" },
  { key: "tier2", label: "16-25 employees", employeeCap: 25, priceId: "price_1U2zwLPsetz2ehJinm6gpv86" },
  { key: "tier3", label: "26-50 employees", employeeCap: 50, priceId: "price_1U2zwLPsetz2ehJiFMhzdYFL" },
  { key: "tier4", label: "51-75 employees", employeeCap: 75, priceId: "price_1U2zwMPsetz2ehJiYRSZFzf7" },
  { key: "tier5", label: "76-100 employees", employeeCap: 100, priceId: "price_1U2zwMPsetz2ehJiBdO7S6DJ" },
] as const;

export type PriceTierKey = typeof PRICE_TIERS[number]["key"];

export function getTierByKey(key: string) {
  return PRICE_TIERS.find((t) => t.key === key) ?? null;
}

export function getTierByPriceId(priceId: string) {
  return PRICE_TIERS.find((t) => t.priceId === priceId) ?? null;
}
