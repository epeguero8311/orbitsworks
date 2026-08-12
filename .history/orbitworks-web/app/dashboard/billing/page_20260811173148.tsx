"use client";

import { useEffect, useState } from "react";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  orderBy,
  getDocs,
  writeBatch,
} from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { PRICE_TIERS } from "@/lib/stripe/tiers";
import CheckoutModal from "@/components/dashboard/billing/CheckoutModal";
import DowngradeModal from "@/components/dashboard/billing/DowngradeModal";
import ConfirmModal from "@/components/dashboard/billing/ConfirmModal";

type CompanyBilling = {
  planTier: string;
  employeeCap: number | null;
  activeEmployeeCount: number;
  subscriptionStatus: string;
};

type EmployeeLite = {
  id: string;
  name: string;
  isSupervisor?: boolean;
};

type PendingDowngrade = {
  tierKey: string;
  requiredCount: number;
  employees: EmployeeLite[];
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
  const [pendingDowngrade, setPendingDowngrade] = useState<PendingDowngrade | null>(null);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [confirmStep, setConfirmStep] = useState<0 | 1 | 2>(0);
  const [confirmTierKey, setConfirmTierKey] = useState<string | null>(null);

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

  function pollForUpdate() {
    let attempts = 0;
    const maxAttempts = 6;
    const poll = setInterval(async () => {
      attempts++;
      await loadCompany();
      if (attempts >= maxAttempts) clearInterval(poll);
    }, 1500);
  }

  async function startCheckout(tierKey: string) {
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

      if (data.clientSecret) {
        setClientSecret(data.clientSecret);
      } else {
        setUpgradingTierKey(null);
        pollForUpdate();
      }
    } catch (err: any) {
      console.error("Checkout error:", err);
      setError(err.message || "Couldn't start checkout. Try again.");
      setUpgradingTierKey(null);
    }
  }

  async function proceedWithPlanChange(tierKey: string) {
    if (!company || !userData?.companyId) return;
    setError("");

    const tier = PRICE_TIERS.find((t) => t.key === tierKey);
    const isDowngradeBelowCap =
      tier && tier.employeeCap !== null && tier.employeeCap < company.activeEmployeeCount;

    if (isDowngradeBelowCap) {
      try {
        const employeesRef = collection(db, "companies", userData.companyId, "employees");
        const q = query(employeesRef, where("active", "==", true), orderBy("createdAt", "desc"));
        const snap = await getDocs(q);
        const list: EmployeeLite[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: (data.name as string) ?? "Unnamed",
            isSupervisor: !!data.isSupervisor,
          };
        });
        setPendingDowngrade({
          tierKey,
          requiredCount: company.activeEmployeeCount - tier.employeeCap,
          employees: list,
        });
      } catch (err) {
        console.error("Load employees for downgrade error:", err);
        setError("Couldn't load your employee list. Try again.");
      }
      return;
    }

    await startCheckout(tierKey);
  }

  // Entry point from clicking a plan's button - starts a two-step
  // confirmation before anything else happens, so an accidental click
  // never immediately changes billing.
  function handleUpgradeClick(tierKey: string) {
    setConfirmTierKey(tierKey);
    setConfirmStep(1);
  }

  function handleConfirmStep1() {
    setConfirmStep(2);
  }

  async function handleConfirmStep2() {
    const tierKey = confirmTierKey;
    setConfirmStep(0);
    setConfirmTierKey(null);
    if (tierKey) {
      await proceedWithPlanChange(tierKey);
    }
  }

  function handleCancelConfirm() {
    setConfirmStep(0);
    setConfirmTierKey(null);
  }

  async function handleConfirmDowngrade(selectedIds: string[]) {
    if (!pendingDowngrade || !userData?.companyId) return;
    setIsDeactivating(true);
    setError("");

    try {
      const batch = writeBatch(db);
      selectedIds.forEach((id) => {
        batch.update(
          doc(db, "companies", userData.companyId as string, "employees", id),
          { active: false }
        );
      });
      await batch.commit();

      const tierKey = pendingDowngrade.tierKey;
      setPendingDowngrade(null);
      await startCheckout(tierKey);
    } catch (err) {
      console.error("Deactivate employees error:", err);
      setError("Couldn't update employees. Try again.");
    } finally {
      setIsDeactivating(false);
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
  const confirmTier = confirmTierKey ? PRICE_TIERS.find((t) => t.key === confirmTierKey) : null;

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

      {confirmStep === 1 && confirmTier && (
        <ConfirmModal
          title={`Switch to ${confirmTier.label}?`}
          message={`Your billing will change to this plan. This is not final yet - you'll get one more chance to confirm.`}
          confirmLabel="Continue"
          onCancel={handleCancelConfirm}
          onConfirm={handleConfirmStep1}
        />
      )}

      {confirmStep === 2 && confirmTier && (
        <ConfirmModal
          title="Are you sure?"
          message={`This will update your subscription to ${confirmTier.label} right away, and your card will be charged or credited the prorated difference.`}
          confirmLabel="Yes, change my plan"
          isDanger
          onCancel={handleCancelConfirm}
          onConfirm={handleConfirmStep2}
        />
      )}

      {clientSecret && (
        <CheckoutModal
          clientSecret={clientSecret}
          onClose={handleCheckoutClose}
          onSuccess={handleCheckoutSuccess}
        />
      )}

      {pendingDowngrade && (
        <DowngradeModal
          requiredCount={pendingDowngrade.requiredCount}
          employees={pendingDowngrade.employees}
          isSubmitting={isDeactivating}
          onCancel={() => setPendingDowngrade(null)}
          onConfirm={handleConfirmDowngrade}
        />
      )}
    </div>
  );
}
