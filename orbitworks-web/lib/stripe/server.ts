import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is not set in the environment.");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  // Pinned to the API version this integration was written against.
  // The installed SDK (v22) ships types for a newer default version where
  // Invoice.payment_intent / Invoice.subscription were removed - pinning here
  // keeps the old Invoice shape our webhook/route code expects.
  // TODO before scaling up billing: migrate route.ts + webhook/route.ts to the
  // newer Invoice Payments / confirmation_secret shape, then drop this pin.
  apiVersion: "2024-06-20" as Stripe.LatestApiVersion,
});
