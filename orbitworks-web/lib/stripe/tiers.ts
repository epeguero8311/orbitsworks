export const PRICE_TIERS = [
  { key: "tier1", label: "1-15 employees", employeeCap: 15, priceId: "price_1U3lFsLSMIEeUJkgvgIe2yJw", priceLabel: "$29/mo" },
  { key: "tier2", label: "16-25 employees", employeeCap: 25, priceId: "price_1U3lGJLSMIEeUJkg67cg6UYm", priceLabel: "$49/mo" },
  { key: "tier3", label: "26-50 employees", employeeCap: 50, priceId: "price_1U3lGbLSMIEeUJkgJ5yU1aMB", priceLabel: "$79/mo" },
  { key: "tier4", label: "51-75 employees", employeeCap: 75, priceId: "price_1U3lH9LSMIEeUJkg48VPkUjl", priceLabel: "$99/mo" },
  { key: "tier5", label: "76-100 employees", employeeCap: 100, priceId: "price_1U3lHMLSMIEeUJkggB9klwFz", priceLabel: "$129/mo" },
] as const;

export type PriceTierKey = typeof PRICE_TIERS[number]["key"];

export function getTierByKey(key: string) {
  return PRICE_TIERS.find((t) => t.key === key) ?? null;
}

export function getTierByPriceId(priceId: string) {
  return PRICE_TIERS.find((t) => t.priceId === priceId) ?? null;
}