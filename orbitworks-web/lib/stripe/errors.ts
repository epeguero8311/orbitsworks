import Stripe from "stripe";

// Only StripeCardError messages are meant for an end user's eyes
// ("Your card was declined.", "Your card has insufficient funds.", etc).
// Anything else (bad price ID, malformed request, API misconfig) is our
// bug, not the customer's - log it in full server-side, show them a
// generic message instead of leaking internals.
export function toClientMessage(
  err: unknown,
  routeName: string
): { message: string; status: number } {
  if (err instanceof Stripe.errors.StripeCardError) {
    return { message: err.message || "Your card was declined.", status: 402 };
  }
  if (err instanceof Stripe.errors.StripeError) {
    console.error(`${routeName} error (Stripe):`, err);
    return {
      message: "Something went wrong on our end. Please try again or contact support.",
      status: 500,
    };
  }
  console.error(`${routeName} error (unexpected):`, err);
  return { message: "Something went wrong. Please try again.", status: 500 };
}
