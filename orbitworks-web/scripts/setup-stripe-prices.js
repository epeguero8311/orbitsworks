const fs = require("fs");
const path = require("path");

function loadEnvLocal() {
  const envPath = path.join(__dirname, "..", ".env.local");
  const content = fs.readFileSync(envPath, "utf8");
  content.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) return;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  });
}

loadEnvLocal();

const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

const PRODUCT_MARKER = "orbitworks_subscription_v1";

// tier1-5 (original Core pricing) are intentionally NOT listed here - they
// are frozen for existing subscribers (see lib/stripe/tiers.ts CORE_TIERS)
// and must never get a new/replacement Price object. Only the 2026
// repricing tiers (new Core keys + the still-unlaunched Pro tiers, which
// have no subscribers yet so can be freely repointed) are created below.
const TIERS = [
  { key: "core2_tier1", label: "Core: 15 active / 20 total employees", amount: 4900, employeeCap: 15, totalCap: 20 },
  { key: "core2_tier2", label: "Core: 25 active / 30 total employees", amount: 7900, employeeCap: 25, totalCap: 30 },
  { key: "core2_tier3", label: "Core: 50 active / 60 total employees", amount: 12900, employeeCap: 50, totalCap: 60 },
  { key: "core2_tier4", label: "Core: 75 active / 85 total employees", amount: 15900, employeeCap: 75, totalCap: 85 },
  { key: "core2_tier5", label: "Core: 100 active / 115 total employees", amount: 19900, employeeCap: 100, totalCap: 115 },
  { key: "pro_tier1", label: "Pro: 15 active / 20 total employees", amount: 7900, employeeCap: 15, totalCap: 20 },
  { key: "pro_tier2", label: "Pro: 25 active / 30 total employees", amount: 11900, employeeCap: 25, totalCap: 30 },
  { key: "pro_tier3", label: "Pro: 50 active / 60 total employees", amount: 19900, employeeCap: 50, totalCap: 60 },
  { key: "pro_tier4", label: "Pro: 75 active / 85 total employees", amount: 24900, employeeCap: 75, totalCap: 85 },
  { key: "pro_tier5", label: "Pro: 100 active / 115 total employees", amount: 29900, employeeCap: 100, totalCap: 115 },
];

async function main() {
  console.log("Looking for existing product...");
  const existingProducts = await stripe.products.search({
    query: `metadata['marker']:'${PRODUCT_MARKER}'`,
  });

  let product;
  if (existingProducts.data.length > 0) {
    product = existingProducts.data[0];
    console.log("Found existing product:", product.id);
  } else {
    product = await stripe.products.create({
      name: "Orbitsworks Subscription",
      metadata: { marker: PRODUCT_MARKER },
    });
    console.log("Created product:", product.id);
  }

  const existingPrices = await stripe.prices.list({
    product: product.id,
    active: true,
    limit: 100,
  });

  const results = [];

  for (const tier of TIERS) {
    // Also require the amount to match - pro_tier1-5 already carried this
    // same tierKey metadata on the OLD, pre-repricing Stripe Price objects
    // (Pro never launched, but its tiers were scaffolded once before).
    // Matching on tierKey alone would silently keep those stale amounts
    // wired up since Stripe prices are immutable and can't be edited in
    // place - a mismatched amount means a new Price object is needed.
    const already = existingPrices.data.find(
      (p) => p.metadata && p.metadata.tierKey === tier.key && p.unit_amount === tier.amount
    );
    if (already) {
      console.log(`Tier ${tier.key} already exists: ${already.id}`);
      results.push({ ...tier, priceId: already.id });
      continue;
    }

    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: tier.amount,
      currency: "usd",
      recurring: { interval: "month" },
      metadata: {
        tierKey: tier.key,
        employeeCap: String(tier.employeeCap),
        totalCap: String(tier.totalCap),
      },
      nickname: tier.label,
    });
    console.log(`Created price for ${tier.key}: ${price.id}`);
    results.push({ ...tier, priceId: price.id });
  }

  // These tiers are read from env vars (lib/stripe/tiers.ts
  // optionalTierV2), not hardcoded here - paste the output below into
  // .env.local for local dev and into apphosting.yaml's matching
  // `variable:` entries for production.
  console.log("\n--- Set these env vars ---\n");
  for (const r of results) {
    console.log(`NEXT_PUBLIC_STRIPE_PRICE_${r.key.toUpperCase()}=${r.priceId}`);
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
