"use client";

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { PRICE_TIERS } from "@/lib/stripe/tiers";
import CheckoutModal from "@/components/dashboard/billing/CheckoutModal";

type CompanyBilling = {
  planTier: string;
  employeeCap: number | null;
  activeEmployeeCount: number;
  trialEndsAt: { toDate: () => Date } | null;
  subscriptionStatus: string;
};

function formatTierLabel(planTier: string): string {
  if (planTier === "free") return "Free plan (up to 8 employees)";
  if (planTier === "custom") return "Custom plan";
  const tier = PRICE_TIERS.find((t) => t.key === planTier);
  return tier ? tier.label : planTier;
}

export default function BillingPage() {
  const { userData } = useAuth();
  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState<CompanyBilling | null>(null);
  const [error, setError] = useState("");
  const [upgradingTierKey, setUpgradingTierKey] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  async function loadCompany() {
    if (!userData?.companyId) return;
    try {
      const snap = await getDoc(doc(db, "companies", userData.companyId));
      if (snap.exists()) {
        setCompany(snap.data() as CompanyBilling);
      }
    } catch (err) {
      console.error("Load billing error:", err);
      setError("Couldn't load billing info.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCompany();
  }, [userData?.companyId]);

  async function handleUpgradeClick(tierKey: string) {
    if (!auth.currentUser) return;
    setError("");
    setUpgradingTierKey(tierKey);

    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch("/api/stripe/create-subscription", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ tierKey }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Something went wrong.");
      }

      setClientSecret(data.clientSecret);
    } catch (err: any) {
      console.error("Upgrade error:", err);
      setError(err.message || "Couldn't start checkout. Try again.");
      setUpgradingTierKey(null);
    }
  }

  function handleCheckoutClose() {
    setClientSecret(null);
    setUpgradingTierKey(null);
  }

  async function handleCheckoutSuccess() {
    setClientSecret(null);
    setUpgradingTierKey(null);
    let attempts = 0;
    const maxAttempts = 6;
    const poll = setInterval(async () => {
      attempts++;
      await loadCompany();
      if (attempts >= maxAttempts) clearInterval(poll);
    }, 1500);
  }

  const isFreePlan = company?.planTier === "free";

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-950">Billing</h1>
      <p className="mt-1.5 text-sm text-gray-600">
        Manage your subscription and employee limits.
      </p>

      {loading ? (
        <p className="mt-8 text-sm text-gray-600">Loading...</p>
      ) : !company ? (
        <p className="mt-8 text-sm text-gray-600">Couldn't load billing info.</p>
      ) : (
        <div className="mt-8 max-w-2xl space-y-6">
          {/* Current plan */}
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <h2 className="text-base font-semibold text-gray-950">Current plan</h2>
            <p className="mt-2 text-sm text-gray-950">
              {formatTierLabel(company.planTier)}
            </p>
            <p className="mt-1 text-xs text-gray-600">
              {company.activeEmployeeCount} of{" "}
              {company.employeeCap === null ? "unlimited" : company.employeeCap} employees used
            </p>
              {isFreePlan && (
                            <p className="mt-3 rounded-lg bg-accent/10 px-3.5 py-2 text-xs font-medium text-accent">
                              You're on the free plan. Upgrade below once you need more than 8 employees.
                            </p>
                          )}
          </div>

          {/* Available plans */}
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <h2 className="text-base font-semibold text-gray-950">Plans</h2>
            <p className="mt-1 text-xs text-gray-600">
              Pricing is based on your total number of employees, including
              supervisors.
            </p>

            <div className="mt-5 divide-y divide-gray-100">
              {PRICE_TIERS.map((tier) => {
                const isCurrent = company.planTier === tier.key;
                return (
                  <div
                    key={tier.key}
                    className={`flex items-center justify-between rounded-lg py-3.5 px-3 ${
                      isCurrent ? "ring-2 ring-accent bg-accent/5" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      {isCurrent && (
                        <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full bg-accent" />
                      )}
                      <p className="text-sm font-medium text-gray-950">
                        {tier.label}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={isCurrent || upgradingTierKey === tier.key}
                      onClick={() => handleUpgradeClick(tier.key)}
                      className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                        isCurrent
                          ? "border-gray-200 text-gray-600"
                          : "border-accent text-accent hover:bg-accent/10"
                      }`}
                    >
                      {isCurrent
                        ? "Current plan"
                        : upgradingTierKey === tier.key
                        ? "Loading..."
                        : "Upgrade"}
                    </button>
                  </div>
                );
              })}

              <div className="flex items-center justify-between py-3.5">
                <p className="text-sm font-medium text-gray-950">
                  101+ employees
                </p>
                <span className="text-sm text-gray-600">Contact us</span>
              </div>
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}

      {clientSecret && (
        <CheckoutModal
          clientSecret={clientSecret}
          onClose={handleCheckoutClose}
          onSuccess={handleCheckoutSuccess}
        />
      )}
    </div>
  );
}
