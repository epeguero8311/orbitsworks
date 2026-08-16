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
    const rawCode = typeof body?.code === "string" ? body.code.trim() : "";
    if (!rawCode) {
      return NextResponse.json({ error: "Enter a promo code." }, { status: 400 });
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
      return NextResponse.json(
        { error: "Add a card before applying a promo code." },
        { status: 400 }
      );
    }

    const paymentMethods = await stripe.paymentMethods.list({
      customer: company.stripeCustomerId,
      type: "card",
      limit: 1,
    });
    if (paymentMethods.data.length === 0) {
      return NextResponse.json(
        { error: "Add a card before applying a promo code." },
        { status: 400 }
      );
    }

    const matches = await stripe.promotionCodes.list({
      code: rawCode,
      active: true,
      limit: 1,
    });
    const promo = matches.data[0];
    if (!promo) {
      return NextResponse.json(
        { error: "That promo code isn't valid or has expired." },
        { status: 400 }
      );
    }

    if (company.stripeSubscriptionId) {
      const existingSub = await stripe.subscriptions.retrieve(company.stripeSubscriptionId);
      if (existingSub.status !== "canceled") {
        await stripe.subscriptions.update(company.stripeSubscriptionId, {
          discounts: [{ promotion_code: promo.id }],
        });
        return NextResponse.json({
          success: true,
          appliedNow: true,
          message: "Promo applied - it'll take effect on your next invoice.",
        });
      }
    }

    await companyRef.update({
      pendingPromotionCode: promo.id,
      pendingPromotionCodeLabel: rawCode.toUpperCase(),
    });

    return NextResponse.json({
      success: true,
      appliedNow: false,
      message: "Promo saved - it'll be applied automatically when you pick a plan below.",
    });
  } catch (err: any) {
    console.error("apply-promo error:", err);
    return NextResponse.json(
      { error: err?.message || "Something went wrong." },
      { status: 500 }
    );
  }
}