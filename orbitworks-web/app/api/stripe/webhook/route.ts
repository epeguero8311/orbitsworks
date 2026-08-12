import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/server";
import { getTierByPriceId } from "@/lib/stripe/tiers";
import { adminDb } from "@/lib/firebase/admin";
import Stripe from "stripe";

const FREE_EMPLOYEE_CAP = 8;

// The installed Stripe SDK's types are generated for its newer default API
// version, which removed `subscription` from Invoice. We pin an older
// apiVersion in lib/stripe/server.ts where that field still exists on the
// actual API response, so this augments the type to match reality.
type InvoiceWithSubscription = Stripe.Invoice & {
  subscription: Stripe.Subscription | string | null;
};

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

// Reverts a company to the permanent free tier, whether triggered by a
// deliberate cancel or by Stripe giving up after failed payment retries.
// If the company is over the free cap, employees are deactivated down to
// 8 automatically - non-supervisors first (randomly among them),
// touching supervisors only if that alone isn't enough.
async function autoRevertToFree(companyId: string) {
  const companyRef = adminDb.collection("companies").doc(companyId);
  const employeesRef = companyRef.collection("employees");
  const activeSnap = await employeesRef.where("active", "==", true).get();

  const employees = activeSnap.docs.map((d) => ({
    id: d.id,
    isSupervisor: !!(d.data() as { isSupervisor?: boolean }).isSupervisor,
  }));

  const excess = employees.length - FREE_EMPLOYEE_CAP;

  if (excess > 0) {
    const nonSupervisors = shuffle(employees.filter((e) => !e.isSupervisor));
    const supervisors = shuffle(employees.filter((e) => e.isSupervisor));
    const toDeactivate = nonSupervisors.concat(supervisors).slice(0, excess);

    const batch = adminDb.batch();
    toDeactivate.forEach((emp) => {
      batch.update(employeesRef.doc(emp.id), { active: false });
    });
    await batch.commit();
  }

  await companyRef.update({
    planTier: "free",
    employeeCap: FREE_EMPLOYEE_CAP,
    subscriptionStatus: "active",
    stripeSubscriptionId: null,
  });
}

export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: "Missing signature or webhook secret." }, { status: 400 });
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        await syncSubscriptionToFirestore(subscription);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const companyId = subscription.metadata?.companyId;
        if (companyId) {
          await autoRevertToFree(companyId);
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as InvoiceWithSubscription;
        const subscriptionId =
          typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;
        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const companyId = subscription.metadata?.companyId;
          if (companyId) {
            await adminDb.collection("companies").doc(companyId).update({
              subscriptionStatus: "past_due",
            });
          }
        }
        break;
      }

      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error("Webhook handler error:", err);
    return NextResponse.json({ error: "Webhook handler failed." }, { status: 500 });
  }
}

async function syncSubscriptionToFirestore(subscription: Stripe.Subscription) {
  const companyId = subscription.metadata?.companyId;
  if (!companyId) {
    console.error("Subscription has no companyId in metadata:", subscription.id);
    return;
  }

  const priceId = subscription.items.data[0]?.price?.id;
  const tier = priceId ? getTierByPriceId(priceId) : null;

  const update: Record<string, unknown> = {
    subscriptionStatus: subscription.status,
    stripeSubscriptionId: subscription.id,
  };

  if (tier && (subscription.status === "active" || subscription.status === "trialing")) {
    update.planTier = tier.key;
    update.employeeCap = tier.employeeCap;
  }

  await adminDb.collection("companies").doc(companyId).update(update);
}
