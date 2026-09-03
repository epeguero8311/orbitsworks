import Stripe from "stripe";

// Lazily initialized so importing this module never throws at build time.
// Next.js imports every API route module during "Collecting page data" at
// build time, before RUNTIME-only secrets (STRIPE_SECRET_KEY) are available -
// only BUILD-availability env vars are present then. Initializing eagerly at
// module scope broke `next build` / Firebase App Hosting rollouts.
let _stripe: Stripe | null = null;

function getStripeClient(): Stripe {
  if (_stripe) return _stripe;
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not set in the environment.");
  }
  _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    // Pinned to the API version this integration was written against.
    // The installed SDK (v22) ships types for a newer default version where
    // Invoice.payment_intent / Invoice.subscription were removed - pinning here
    // keeps the old Invoice shape our webhook/route code expects.
    // TODO before scaling up billing: migrate route.ts + webhook/route.ts to the
    // newer Invoice Payments / confirmation_secret shape, then drop this pin.
    apiVersion: "2024-06-20" as Stripe.LatestApiVersion,
  });
  return _stripe;
}

// Backward-compatible export - existing `import { stripe } from "@/lib/stripe/server"`
// call sites don't need to change. Real client (and the env var check) is only
// created on first actual property access at request time, never at import time.
export const stripe: Stripe = new Proxy({} as Stripe, {
  get(_target, prop, receiver) {
    const client = getStripeClient();
    const value = Reflect.get(client as object, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});