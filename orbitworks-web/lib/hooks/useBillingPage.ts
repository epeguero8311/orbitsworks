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
import { PRICE_TIERS, getTierByKey } from "@/lib/stripe/tiers";
import { usePaymentMethod } from "@/lib/hooks/usePaymentMethod";
import { ToastVariant } from "@/components/Toast";

const FREE_CAP = 8;

export type CompanyBilling = {
  planTier: string;
  employeeCap: number | null;
  activeEmployeeCount: number;
  totalEmployeeCap: number | null;
  totalEmployeeCount: number;
  subscriptionStatus: string;
  pendingPromotionCodeLabel?: string | null;
};

type EmployeeLite = {
  id: string;
  name: string;
  isSupervisor?: boolean;
  active?: boolean;
};

type PendingDowngrade = {
  action: "tier" | "cancel";
  tierKey: string | null;
  requiredCount: number;
  employees: EmployeeLite[];
};

type PendingDeletion = {
  tierKey: string;
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
  const tier = getTierByKey(planTier);
  if (!tier) return planTier;
  const productLabel = tier.product === "pro" ? "Pro" : "Core";
  return `${productLabel} - ${tier.label}`;
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
  const [pendingDeletion, setPendingDeletion] = useState<PendingDeletion | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmStep, setConfirmStep] = useState<0 | 1 | 2>(0);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [toast, setToast] = useState<{ message: string; variant: ToastVariant } | null>(null);
  // Drives the full-screen dimmed overlay shown while a plan change is
  // actually being committed (Stripe call + the webhook-driven Firestore
  // update that follows it) - not shown while a modal needs the admin's
  // input (picking who to deactivate/delete), only during the "just wait"
  // stretches either side of that.
  const [overlayMessage, setOverlayMessage] = useState<string | null>(null);

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

  async function loadCompany(): Promise<CompanyBilling | null> {
    if (!userData?.companyId) return null;
    try {
      const snap = await getDoc(doc(db, "companies", userData.companyId));
      if (snap.exists()) {
        const data = snap.data() as CompanyBilling;
        setCompany(data);
        return data;
      }
      return null;
    } catch (err) {
      console.error("Load billing error:", err);
      setLoadError("Couldn't load billing info.");
      return null;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCompany();
  }, [userData?.companyId]);

  // Fire-and-forget refresh for things with no specific predicate to wait
  // on (e.g. payment method changes) - unlike waitForCompanyUpdate below,
  // nothing blocks on this finishing.
  function pollForUpdate() {
    let attempts = 0;
    const maxAttempts = 6;
    const poll = setInterval(async () => {
      attempts++;
      await loadCompany();
      if (attempts >= maxAttempts) clearInterval(poll);
    }, 1500);
  }

  // Stripe's subscription webhook lands asynchronously after the API call
  // that triggers it returns, so the Firestore doc doesn't reflect a plan
  // change the instant checkout/cancel succeeds. This polls until the
  // predicate is true (or gives up after ~15s) so the loading overlay
  // stays up for exactly as long as that real wait takes, instead of the
  // UI flashing stale plan data while a fixed-delay poll catches up.
  async function waitForCompanyUpdate(
    predicate: (c: CompanyBilling) => boolean,
    maxAttempts = 10,
    intervalMs = 1500
  ) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const data = await loadCompany();
      if (data && predicate(data)) return;
      if (attempt < maxAttempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    }
  }

  async function startCheckout(tierKey: string) {
    if (!auth.currentUser) return;
    setBusy(tierKey);
    setOverlayMessage("Updating your plan...");

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
        // Hands off to CheckoutModal's own UI (3D Secure confirmation) -
        // busy stays set (cleared by handleCheckoutClose/Success) so the
        // plan button stays disabled while that modal is open.
        setOverlayMessage(null);
        setClientSecret(data.clientSecret);
      } else {
        await waitForCompanyUpdate((c) => c.planTier === tierKey);
        setBusy(null);
        setOverlayMessage(null);
        showToast("Plan updated.", "success");
      }
    } catch (err: any) {
      console.error("Checkout error:", err);
      showToast(err.message || "Couldn't start checkout. Try again.", "error");
      setBusy(null);
      setOverlayMessage(null);
    }
  }

  async function startCancel() {
    if (!auth.currentUser) return;
    setBusy("cancel");
    setOverlayMessage("Canceling your subscription...");

    try {
      const res = await authedFetch("/api/stripe/cancel-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Something went wrong.");
      }
      await waitForCompanyUpdate((c) => c.planTier === "free");
      setBusy(null);
      setOverlayMessage(null);
      showToast("Subscription canceled.", "success");
    } catch (err: any) {
      console.error("Cancel error:", err);
      showToast(err.message || "Couldn't cancel your subscription. Try again.", "error");
      setBusy(null);
      setOverlayMessage(null);
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
        active: true,
      };
    });
  }

  // Unlike loadEmployeesForDowngrade, this includes inactive records too -
  // totalEmployeeCount counts active and inactive together, so fixing a
  // total-cap overage means deleting records, not just deactivating them.
  // Inactive ones sort first since they're the expected pick.
  async function loadEmployeesForDeletion(): Promise<EmployeeLite[]> {
    if (!userData?.companyId) return [];
    const employeesRef = collection(db, "companies", userData.companyId, "employees");
    const q = query(employeesRef, orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    const employees = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        name: (data.name as string) ?? "Unnamed",
        isSupervisor: !!data.isSupervisor,
        active: !!data.active,
      };
    });
    return employees.sort((a, b) => Number(!!a.active) - Number(!!b.active));
  }

  // Last step of both the plain downgrade path and the post-deletion
  // continuation below: once the total-record dimension (if any) is
  // already satisfied, this is the only remaining gate before checkout.
  async function checkActiveCapAndProceed(
    tierKey: string,
    tier: ReturnType<typeof PRICE_TIERS.find>,
    activeCount: number
  ) {
    const isDowngradeBelowCap =
      tier && tier.employeeCap !== null && tier.employeeCap < activeCount;

    if (isDowngradeBelowCap && tier) {
      setOverlayMessage("Checking your employees...");
      try {
        const employees = await loadEmployeesForDowngrade();
        setPendingDowngrade({
          action: "tier",
          tierKey,
          requiredCount: activeCount - tier.employeeCap,
          employees,
        });
      } catch (err) {
        console.error("Load employees for downgrade error:", err);
        showToast("Couldn't load your employee list. Try again.", "error");
      } finally {
        setOverlayMessage(null);
      }
      return;
    }

    await startCheckout(tierKey);
  }

  async function proceedWithTierChange(tierKey: string) {
    if (!company) return;

    const tier = PRICE_TIERS.find((t) => t.key === tierKey);

    const currentTotalCount = company.totalEmployeeCount ?? 0;
    const isOverTotalCap =
      !!tier && tier.totalCap !== null && tier.totalCap < currentTotalCount;

    if (isOverTotalCap && tier) {
      setOverlayMessage("Checking your employee records...");
      try {
        const employees = await loadEmployeesForDeletion();
        setPendingDeletion({
          tierKey,
          requiredCount: currentTotalCount - tier.totalCap!,
          employees,
        });
      } catch (err) {
        console.error("Load employees for deletion error:", err);
        showToast("Couldn't load your employee list. Try again.", "error");
      } finally {
        setOverlayMessage(null);
      }
      return;
    }

    await checkActiveCapAndProceed(tierKey, tier, company.activeEmployeeCount);
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

  async function handleConfirmDeletion(selectedIds: string[]) {
    if (!pendingDeletion) return;
    setIsDeleting(true);

    try {
      const deleteEmployeesBulk = httpsCallable(functions, "deleteEmployeesBulk");
      await deleteEmployeesBulk({ employeeIds: selectedIds });

      const { tierKey, employees } = pendingDeletion;
      const deletedActiveCount = employees.filter(
        (e) => selectedIds.includes(e.id) && e.active
      ).length;
      setPendingDeletion(null);

      const tier = PRICE_TIERS.find((t) => t.key === tierKey);
      const newActiveCount = (company?.activeEmployeeCount ?? 0) - deletedActiveCount;
      await checkActiveCapAndProceed(tierKey, tier, newActiveCount);
    } catch (err) {
      console.error("Delete employees error:", err);
      showToast("Couldn't delete employee records. Try again.", "error");
    } finally {
      setIsDeleting(false);
    }
  }

  function handleCancelDeletion() {
    setPendingDeletion(null);
  }

  function handleCheckoutClose() {
    setClientSecret(null);
    setBusy(null);
  }

  async function handleCheckoutSuccess() {
    const tierKey = busy;
    setClientSecret(null);
    setOverlayMessage("Updating your plan...");
    if (tierKey) {
      await waitForCompanyUpdate((c) => c.planTier === tierKey);
    }
    setBusy(null);
    setOverlayMessage(null);
    showToast("Plan updated.", "success");
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
    pendingDeletion,
    isDeleting,
    overlayMessage,
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
    handleConfirmDeletion,
    handleCancelDeletion,
    handleCheckoutClose,
    handleCheckoutSuccess,
    handleUpdatePaymentClick,
    handleUpdatePaymentClose,
    handleUpdatePaymentSuccess,
    handleApplyPromo,
  };
}
