"use client";

import { useBillingPage, formatTierLabel } from "@/lib/hooks/useBillingPage";
import CheckoutModal from "@/components/dashboard/billing/CheckoutModal";
import DowngradeModal from "@/components/dashboard/billing/DowngradeModal";
import ConfirmModal from "@/components/dashboard/billing/ConfirmModal";
import UpdatePaymentModal from "@/components/dashboard/billing/UpdatePaymentModal";
import PaymentMethodCard from "@/components/dashboard/billing/PaymentMethodCard";
import PromoCodeCard from "@/components/dashboard/billing/PromoCodeCard";
import { CurrentPlanCard } from "@/components/dashboard/billing/CurrentPlanCard";
import { PlansList } from "@/components/dashboard/billing/PlansList";
import { Toast } from "@/components/Toast";

export default function BillingPage() {
  const b = useBillingPage();

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-950">Billing</h1>
      <p className="mt-1.5 text-sm text-gray-600">
        Manage your subscription and employee limits.
      </p>

      {b.loading ? (
        <p className="mt-8 text-sm text-gray-600">Loading...</p>
      ) : !b.company ? (
        <p className="mt-8 text-sm text-gray-600">
          {b.loadError || "Couldn't load billing info."}
        </p>
      ) : (
        <div className="mt-8 max-w-2xl space-y-6">
          <CurrentPlanCard
            company={b.company}
            isFreePlan={b.isFreePlan}
            isPastDue={b.isPastDue}
            planLabel={formatTierLabel(b.company.planTier)}
            busy={b.busy}
            onUpdatePaymentClick={b.handleUpdatePaymentClick}
            onCancelClick={b.handleCancelClick}
          />

          <PaymentMethodCard
            paymentMethod={b.paymentMethod}
            loading={b.paymentMethodLoading}
            error={b.paymentMethodError}
            busy={b.busy === "update-payment"}
            onUpdateClick={b.handleUpdatePaymentClick}
          />

          <PromoCodeCard
            pendingLabel={b.company.pendingPromotionCodeLabel}
            onApply={b.handleApplyPromo}
          />

          <PlansList
            currentPlanTier={b.company.planTier}
            busy={b.busy}
            onTierClick={b.handleTierClick}
          />
        </div>
      )}

      {b.confirmStep === 1 && b.confirmAction?.type === "tier" && b.confirmTier && (
        <ConfirmModal
          title={`Switch to ${b.confirmTier.label}?`}
          message="Your billing will change to this plan. This is not final yet - you'll get one more chance to confirm."
          confirmLabel="Continue"
          onCancel={b.handleCancelConfirm}
          onConfirm={b.handleConfirmStep1}
        />
      )}
      {b.confirmStep === 2 && b.confirmAction?.type === "tier" && b.confirmTier && (
        <ConfirmModal
          title="Are you sure?"
          message={`This will update your subscription to ${b.confirmTier.label} right away, and your card will be charged or credited the prorated difference.`}
          confirmLabel="Yes, change my plan"
          isDanger
          onCancel={b.handleCancelConfirm}
          onConfirm={b.handleConfirmStep2}
        />
      )}

      {b.confirmStep === 1 && b.confirmAction?.type === "cancel" && (
        <ConfirmModal
          title="Cancel your subscription?"
          message="You'll be moved to the free plan, capped at 8 employees. This is not final yet - you'll get one more chance to confirm."
          confirmLabel="Continue"
          onCancel={b.handleCancelConfirm}
          onConfirm={b.handleConfirmStep1}
        />
      )}
      {b.confirmStep === 2 && b.confirmAction?.type === "cancel" && (
        <ConfirmModal
          title="Are you sure?"
          message={
            b.company && b.company.activeEmployeeCount > b.freeCap
              ? `This cancels your paid subscription immediately and moves your company to the free plan (8 employees). You currently have ${b.company.activeEmployeeCount} active - ${b.company.activeEmployeeCount - b.freeCap} will be automatically deactivated, non-supervisors first.`
              : "This cancels your paid subscription immediately and moves your company to the free plan."
          }
          confirmLabel="Yes, cancel my plan"
          isDanger
          onCancel={b.handleCancelConfirm}
          onConfirm={b.handleConfirmStep2}
        />
      )}

      {b.clientSecret && (
        <CheckoutModal
          clientSecret={b.clientSecret}
          onClose={b.handleCheckoutClose}
          onSuccess={b.handleCheckoutSuccess}
        />
      )}

      {b.setupClientSecret && (
        <UpdatePaymentModal
          clientSecret={b.setupClientSecret}
          onClose={b.handleUpdatePaymentClose}
          onSuccess={b.handleUpdatePaymentSuccess}
        />
      )}

      {b.pendingDowngrade && (
        <DowngradeModal
          requiredCount={b.pendingDowngrade.requiredCount}
          employees={b.pendingDowngrade.employees}
          isSubmitting={b.isDeactivating}
          onCancel={b.handleCancelDowngrade}
          onConfirm={b.handleConfirmDowngrade}
        />
      )}

      <Toast
        visible={!!b.toast}
        message={b.toast?.message ?? ""}
        variant={b.toast?.variant ?? "error"}
        onClose={b.dismissToast}
      />
    </div>
  );
}
