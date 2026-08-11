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

const TIERS = [
  { key: "tier1", label: "1-15 employees", amount: 2900, employeeCap: 15 },
  { key: "tier2", label: "16-25 employees", amount: 4900, employeeCap: 25 },
  { key: "tier3", label: "26-50 employees", amount: 7900, employeeCap: 50 },
  { key: "tier4", label: "51-75 employees", amount: 9900, employeeCap: 75 },
  { key: "tier5", label: "76-100 employees", amount: 12900, employeeCap: 100 },
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
    const already = existingPrices.data.find(
      (p) => p.metadata && p.metadata.tierKey === tier.key
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
      metadata: { tierKey: tier.key, employeeCap: String(tier.employeeCap) },
      nickname: tier.label,
    });
    console.log(`Created price for ${tier.key}: ${price.id}`);
    results.push({ ...tier, priceId: price.id });
  }

  console.log("\n--- Paste this into lib/stripe/tiers.ts ---\n");
  console.log("export const PRICE_TIERS = [");
  for (const r of results) {
    console.log(
      `  { key: "${r.key}", label: "${r.label}", employeeCap: ${r.employeeCap}, priceId: "${r.priceId}" },`
    );
  }
  console.log("];");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
