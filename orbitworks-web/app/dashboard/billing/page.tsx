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
import { usePaymentMethod } from "@/lib/hooks/usePaymentMethod";
import CheckoutModal from "@/components/dashboard/billing/CheckoutModal";
import DowngradeModal from "@/components/dashboard/billing/DowngradeModal";
import ConfirmModal from "@/components/dashboard/billing/ConfirmModal";
import UpdatePaymentModal from "@/components/dashboard/billing/UpdatePaymentModal";
import PaymentMethodCard from "@/components/dashboard/billing/PaymentMethodCard";

const FREE_CAP = 8;

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
  action: "tier" | "cancel";
  tierKey: string | null;
  requiredCount: number;
  employees: EmployeeLite[];
};

type ConfirmAction =
  | { type: "tier"; tierKey: string }
  | { type: "cancel" }
  | null;

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
  const [busy, setBusy] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [setupClientSecret, setSetupClientSecret] = useState<string | null>(null);
  const [pendingDowngrade, setPendingDowngrade] = useState<PendingDowngrade | null>(null);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [confirmStep, setConfirmStep] = useState<0 | 1 | 2>(0);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);

  const {
    paymentMethod,
    loading: paymentMethodLoading,
    error: paymentMethodError,
    reload: reloadPaymentMethod,
  } = usePaymentMethod(userData?.companyId);

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
    setBusy(tierKey);

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
        setBusy(null);
        pollForUpdate();
      }
    } catch (err: any) {
      console.error("Checkout error:", err);
      setError(err.message || "Couldn't start checkout. Try again.");
      setBusy(null);
    }
  }

  async function startCancel() {
    if (!auth.currentUser) return;
    setError("");
    setBusy("cancel");

    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch("/api/stripe/cancel-subscription", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Something went wrong.");
      }
      setBusy(null);
      pollForUpdate();
    } catch (err: any) {
      console.error("Cancel error:", err);
      setError(err.message || "Couldn't cancel your subscription. Try again.");
      setBusy(null);
    }
  }

  async function loadEmployeesForDowngrade(): Promise<EmployeeLite[]> {
    if (!userData?.companyId) return [];
    const employeesRef = collection(db, "companies", userData.companyId, "employees");
    const q = query(employeesRef, where("active", "==", true), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        name: (data.name as string) ?? "Unnamed",
        isSupervisor: !!data.isSupervisor,
      };
    });
  }

  async function proceedWithTierChange(tierKey: string) {
    if (!company) return;
    setError("");

    const tier = PRICE_TIERS.find((t) => t.key === tierKey);
    const isDowngradeBelowCap =
      tier && tier.employeeCap !== null && tier.employeeCap < company.activeEmployeeCount;

    if (isDowngradeBelowCap && tier) {
      try {
        const employees = await loadEmployeesForDowngrade();
        setPendingDowngrade({
          action: "tier",
          tierKey,
          requiredCount: company.activeEmployeeCount - tier.employeeCap,
          employees,
        });
      } catch (err) {
        console.error("Load employees for downgrade error:", err);
        setError("Couldn't load your employee list. Try again.");
      }
      return;
    }

    await startCheckout(tierKey);
  }

  async function proceedWithCancel() {
    await startCancel();
  }

  function handleTierClick(tierKey: string) {
    setConfirmAction({ type: "tier", tierKey });
    setConfirmStep(1);
  }

  function handleCancelClick() {
    setConfirmAction({ type: "cancel" });
    setConfirmStep(1);
  }

  function handleConfirmStep1() {
    setConfirmStep(2);
  }

  async function handleConfirmStep2() {
    const action = confirmAction;
    setConfirmStep(0);
    setConfirmAction(null);
    if (!action) return;

    if (action.type === "tier") {
      await proceedWithTierChange(action.tierKey);
    } else {
      await proceedWithCancel();
    }
  }

  function handleCancelConfirm() {
    setConfirmStep(0);
    setConfirmAction(null);
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

      const { action, tierKey } = pendingDowngrade;
      setPendingDowngrade(null);

      if (action === "cancel") {
        await startCancel();
      } else if (tierKey) {
        await startCheckout(tierKey);
      }
    } catch (err) {
      console.error("Deactivate employees error:", err);
      setError("Couldn't update employees. Try again.");
    } finally {
      setIsDeactivating(false);
    }
  }

  function handleCheckoutClose() {
    setClientSecret(null);
    setBusy(null);
  }

  async function handleCheckoutSuccess() {
    setClientSecret(null);
    setBusy(null);
    pollForUpdate();
  }

  async function handleUpdatePaymentClick() {
    if (!auth.currentUser) return;
    setError("");
    setBusy("update-payment");

    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch("/api/stripe/create-setup-intent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Something went wrong.");
      }
      setSetupClientSecret(data.clientSecret);
    } catch (err: any) {
      console.error("Create setup intent error:", err);
      setError(err.message || "Couldn't start payment update. Try again.");
    } finally {
      setBusy(null);
    }
  }

  function handleUpdatePaymentClose() {
    setSetupClientSecret(null);
  }

  function handleUpdatePaymentSuccess() {
    setSetupClientSecret(null);
    pollForUpdate();
    reloadPaymentMethod();
  }

  const isFreePlan = company?.planTier === "free";
  const isPastDue = company?.subscriptionStatus === "past_due";
  const confirmTier =
    confirmAction?.type === "tier"
      ? PRICE_TIERS.find((t) => t.key === confirmAction.tierKey)
      : null;

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
          {isPastDue && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-6">
              <h2 className="text-base font-semibold text-red-900">
                Your last payment failed
              </h2>
              <p className="mt-1.5 text-sm text-red-800">
                Update your payment method to keep adding employees and stay
                on your current plan.
              </p>
              <button
                type="button"
                disabled={busy === "update-payment"}
                onClick={handleUpdatePaymentClick}
                className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-60"
              >
                {busy === "update-payment" ? "Loading..." : "Update payment method"}
              </button>
            </div>
          )}

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
            {!isFreePlan && !isPastDue && (
              <button
                type="button"
                onClick={handleCancelClick}
                className="mt-4 text-sm font-medium text-gray-600 hover:text-red-600 hover:underline"
              >
                Cancel subscription and return to the free plan
              </button>
            )}
          </div>

          <PaymentMethodCard
            paymentMethod={paymentMethod}
            loading={paymentMethodLoading}
            error={paymentMethodError}
            busy={busy === "update-payment"}
            onUpdateClick={handleUpdatePaymentClick}
          />

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
                        <span className="ml-2 font-normal text-gray-600">
                          {tier.priceLabel}
                        </span>
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={isCurrent || busy === tier.key}
                      onClick={() => handleTierClick(tier.key)}
                      className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                        isCurrent
                          ? "border-gray-200 text-gray-600"
                          : "border-accent text-accent hover:bg-accent/10"
                      }`}
                    >
                      {isCurrent
                        ? "Current plan"
                        : busy === tier.key
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

      {confirmStep === 1 && confirmAction?.type === "tier" && confirmTier && (
        <ConfirmModal
          title={`Switch to ${confirmTier.label}?`}
          message="Your billing will change to this plan. This is not final yet - you'll get one more chance to confirm."
          confirmLabel="Continue"
          onCancel={handleCancelConfirm}
          onConfirm={handleConfirmStep1}
        />
      )}
      {confirmStep === 2 && confirmAction?.type === "tier" && confirmTier && (
        <ConfirmModal
          title="Are you sure?"
          message={`This will update your subscription to ${confirmTier.label} right away, and your card will be charged or credited the prorated difference.`}
          confirmLabel="Yes, change my plan"
          isDanger
          onCancel={handleCancelConfirm}
          onConfirm={handleConfirmStep2}
        />
      )}

      {confirmStep === 1 && confirmAction?.type === "cancel" && (
        <ConfirmModal
          title="Cancel your subscription?"
          message="You'll be moved to the free plan, capped at 8 employees. This is not final yet - you'll get one more chance to confirm."
          confirmLabel="Continue"
          onCancel={handleCancelConfirm}
          onConfirm={handleConfirmStep1}
        />
      )}
      {confirmStep === 2 && confirmAction?.type === "cancel" && (
        <ConfirmModal
          title="Are you sure?"
          message={
            company && company.activeEmployeeCount > FREE_CAP
              ? `This cancels your paid subscription immediately and moves your company to the free plan (8 employees). You currently have ${company.activeEmployeeCount} active - ${company.activeEmployeeCount - FREE_CAP} will be automatically deactivated, non-supervisors first.`
              : "This cancels your paid subscription immediately and moves your company to the free plan."
          }
          confirmLabel="Yes, cancel my plan"
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

      {setupClientSecret && (
        <UpdatePaymentModal
          clientSecret={setupClientSecret}
          onClose={handleUpdatePaymentClose}
          onSuccess={handleUpdatePaymentSuccess}
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