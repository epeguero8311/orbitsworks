const Stripe = require("stripe");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

async function createPromo(months, code) {
  const coupon = await stripe.coupons.create({
    percent_off: 100,
    duration: "repeating",
    duration_in_months: months,
    name: months + " month" + (months > 1 ? "s" : "") + " free trial",
  });

  const promoCode = await stripe.promotionCodes.create({
    coupon: coupon.id,
    code: code,
    max_redemptions: 50,
  });

  console.log(code + ": coupon=" + coupon.id + " promo=" + promoCode.id);
}

async function main() {
  await createPromo(1, "TRIAL1MO");
  await createPromo(2, "TRIAL2MO");
  await createPromo(3, "TRIAL3MO");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});