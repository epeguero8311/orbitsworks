import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { stripe } from "@/lib/stripe/server";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) {
      return NextResponse.json({ error: "Missing auth token." }, { status: 401 });
    }

    const decoded = await adminAuth.verifyIdToken(idToken);
    const role = decoded.role as string | undefined;
    const companyId = decoded.companyId as string | undefined;

    if (!companyId || role !== "admin") {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }

    const body = await request.json();
    const paymentMethodId = typeof body?.paymentMethodId === "string" ? body.paymentMethodId : null;
    if (!paymentMethodId) {
      return NextResponse.json({ error: "Missing payment method." }, { status: 400 });
    }

    const companyRef = adminDb.collection("companies").doc(companyId);
    const companySnap = await companyRef.get();
    if (!companySnap.exists) {
      return NextResponse.json({ error: "Company not found." }, { status: 404 });
    }
    const company = companySnap.data() as {
      stripeCustomerId?: string | null;
      stripeSubscriptionId?: string | null;
    };
    if (!company.stripeCustomerId) {
      return NextResponse.json({ error: "No billing account on file yet." }, { status: 400 });
    }

    await stripe.paymentMethods.attach(paymentMethodId, { customer: company.stripeCustomerId });
    await stripe.customers.update(company.stripeCustomerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });

    if (company.stripeSubscriptionId) {
      await stripe.subscriptions.update(company.stripeSubscriptionId, {
        default_payment_method: paymentMethodId,
      });

      const subscription = await stripe.subscriptions.retrieve(company.stripeSubscriptionId, {
        expand: ["latest_invoice"],
      });
      const latestInvoice = subscription.latest_invoice;

      if (typeof latestInvoice === "object" && latestInvoice && latestInvoice.status === "open") {
        await stripe.invoices.pay(latestInvoice.id, { payment_method: paymentMethodId });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("update-payment-method error:", err);
    return NextResponse.json(
      { error: err?.message || "Something went wrong." },
      { status: 500 }
    );
  }
}
