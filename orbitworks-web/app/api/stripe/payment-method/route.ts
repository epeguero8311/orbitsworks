import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { stripe } from "@/lib/stripe/server";

export async function GET(request: NextRequest) {
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

    const companySnap = await adminDb.collection("companies").doc(companyId).get();
    if (!companySnap.exists) {
      return NextResponse.json({ error: "Company not found." }, { status: 404 });
    }
    const company = companySnap.data() as { stripeCustomerId?: string | null };
    if (!company.stripeCustomerId) {
      return NextResponse.json({ paymentMethod: null });
    }

    let customer;
    try {
      customer = await stripe.customers.retrieve(company.stripeCustomerId);
    } catch (err: any) {
      if (err?.code === "resource_missing") {
        console.warn(
          `Stripe customer ${company.stripeCustomerId} not found for company ${companyId} (mode mismatch or deleted customer).`
        );
        return NextResponse.json({ paymentMethod: null });
      }
      throw err;
    }

    if ((customer as any).deleted) {
      return NextResponse.json({ paymentMethod: null });
    }

    const invoiceSettings = (customer as any).invoice_settings;
    let defaultPmId: string | null =
      typeof invoiceSettings?.default_payment_method === "string"
        ? invoiceSettings.default_payment_method
        : invoiceSettings?.default_payment_method?.id ?? null;

    if (!defaultPmId) {
      const pms = await stripe.paymentMethods.list({
        customer: company.stripeCustomerId,
        type: "card",
        limit: 1,
      });
      defaultPmId = pms.data[0]?.id ?? null;
    }

    if (!defaultPmId) {
      return NextResponse.json({ paymentMethod: null });
    }

    const pm = await stripe.paymentMethods.retrieve(defaultPmId);
    if (!pm.card) {
      return NextResponse.json({ paymentMethod: null });
    }

    return NextResponse.json({
      paymentMethod: {
        brand: pm.card.brand,
        last4: pm.card.last4,
        expMonth: pm.card.exp_month,
        expYear: pm.card.exp_year,
      },
    });
  } catch (err: any) {
    console.error("payment-method GET error:", err);
    return NextResponse.json(
      { error: err?.message || "Something went wrong." },
      { status: 500 }
    );
  }
}