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
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, auth, functions } from "@/lib/firebase";
import { authedFetch } from "@/lib/authedFetch";
import { useAuth } from "@/lib/AuthContext";
import { PRICE_TIERS } from "@/lib/stripe/tiers";
import { usePaymentMethod } from "@/lib/hooks/usePaymentMethod";
import { ToastVariant } from "@/components/Toast";

const FREE_CAP = 8;

export type CompanyBilling = {
  planTier: string;
  employeeCap: number | null;
  activeEmployeeCount: number;
  subscriptionStatus: string;
  pendingPromotionCodeLabel?: string | null;
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

export function formatTierLabel(planTier: string): string {
  if (planTier === "free") return "Free plan (up to 8 employees)";
  if (planTier === "custom") return "Custom plan";
  const tier = PRICE_TIERS.find((t) => t.key === planTier);
  return tier ? tier.label : planTier;
}

export function useBillingPage() {
  const { userData } = useAuth();
  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState<CompanyBilling | null>(null);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [setupClientSecret, setSetupClientSecret] = useState<string | null>(null);
  const [pendingDowngrade, setPendingDowngrade] = useState<PendingDowngrade | null>(null);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [confirmStep, setConfirmStep] = useState<0 | 1 | 2>(0);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [toast, setToast] = useState<{ message: string; variant: ToastVariant } | null>(null);

  function showToast(message: string, variant: ToastVariant = "error") {
    setToast({ message, variant });
  }

  function dismissToast() {
    setToast(null);
  }

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
      setLoadError("Couldn't load billing info.");
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
    setBusy(tierKey);

    try {
      const res = await authedFetch("/api/stripe/create-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
        showToast("Plan updated.", "success");
        pollForUpdate();
      }
    } catch (err: any) {
      console.error("Checkout error:", err);
      showToast(err.message || "Couldn't start checkout. Try again.", "error");
      setBusy(null);
    }
  }

  async function startCancel() {
    if (!auth.currentUser) return;
    setBusy("cancel");

    try {
      const res = await authedFetch("/api/stripe/cancel-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Something went wrong.");
      }
      setBusy(null);
      showToast("Subscription canceled.", "success");
      pollForUpdate();
    } catch (err: any) {
      console.error("Cancel error:", err);
      showToast(err.message || "Couldn't cancel your subscription. Try again.", "error");
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
        showToast("Couldn't load your employee list. Try again.", "error");
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

    try {
      const deactivateEmployeesBulk = httpsCallable(functions, "deactivateEmployeesBulk");
      await deactivateEmployeesBulk({ employeeIds: selectedIds });

      const { action, tierKey } = pendingDowngrade;
      setPendingDowngrade(null);

      if (action === "cancel") {
        await startCancel();
      } else if (tierKey) {
        await startCheckout(tierKey);
      }
    } catch (err) {
      console.error("Deactivate employees error:", err);
      showToast("Couldn't update employees. Try again.", "error");
    } finally {
      setIsDeactivating(false);
    }
  }

  function handleCancelDowngrade() {
    setPendingDowngrade(null);
  }

  function handleCheckoutClose() {
    setClientSecret(null);
    setBusy(null);
  }

  async function handleCheckoutSuccess() {
    setClientSecret(null);
    setBusy(null);
    showToast("Plan updated.", "success");
    pollForUpdate();
  }

  async function handleUpdatePaymentClick() {
    if (!auth.currentUser) return;
    setBusy("update-payment");

    try {
      const res = await authedFetch("/api/stripe/create-setup-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Something went wrong.");
      }
      setSetupClientSecret(data.clientSecret);
    } catch (err: any) {
      console.error("Create setup intent error:", err);
      showToast(err.message || "Couldn't start payment update. Try again.", "error");
    } finally {
      setBusy(null);
    }
  }

  function handleUpdatePaymentClose() {
    setSetupClientSecret(null);
  }

  function handleUpdatePaymentSuccess() {
    setSetupClientSecret(null);
    showToast("Payment method updated.", "success");
    pollForUpdate();
    reloadPaymentMethod();
  }

  async function handleApplyPromo(code: string) {
    if (!auth.currentUser) throw new Error("Not signed in.");
    const res = await authedFetch("/api/stripe/apply-promo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Something went wrong.");
    }
    await loadCompany();
  }

  const isFreePlan = company?.planTier === "free";
  const isPastDue = company?.subscriptionStatus === "past_due";
  const confirmTier =
    confirmAction?.type === "tier"
      ? PRICE_TIERS.find((t) => t.key === confirmAction.tierKey)
      : null;

  return {
    loading,
    company,
    loadError,
    busy,
    clientSecret,
    setupClientSecret,
    pendingDowngrade,
    isDeactivating,
    confirmStep,
    confirmAction,
    confirmTier,
    toast,
    dismissToast,
    paymentMethod,
    paymentMethodLoading,
    paymentMethodError,
    isFreePlan,
    isPastDue,
    freeCap: FREE_CAP,
    handleTierClick,
    handleCancelClick,
    handleConfirmStep1,
    handleConfirmStep2,
    handleCancelConfirm,
    handleConfirmDowngrade,
    handleCancelDowngrade,
    handleCheckoutClose,
    handleCheckoutSuccess,
    handleUpdatePaymentClick,
    handleUpdatePaymentClose,
    handleUpdatePaymentSuccess,
    handleApplyPromo,
  };
}
