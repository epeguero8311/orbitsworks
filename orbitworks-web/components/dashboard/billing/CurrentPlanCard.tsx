"use client";

import type { CompanyBilling } from "@/lib/hooks/useBillingPage";

export function CurrentPlanCard({
  company,
  isFreePlan,
  isPastDue,
  planLabel,
  busy,
  onUpdatePaymentClick,
  onCancelClick,
}: {
  company: CompanyBilling;
  isFreePlan: boolean;
  isPastDue: boolean;
  planLabel: string;
  busy: string | null;
  onUpdatePaymentClick: () => void;
  onCancelClick: () => void;
}) {
  return (
    <>
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
            onClick={onUpdatePaymentClick}
            className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-60"
          >
            {busy === "update-payment" ? "Loading..." : "Update payment method"}
          </button>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-base font-semibold text-gray-950">Current plan</h2>
        <p className="mt-2 text-sm text-gray-950">{planLabel}</p>
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
            onClick={onCancelClick}
            className="mt-4 text-sm font-medium text-gray-600 hover:text-red-600 hover:underline"
          >
            Cancel subscription and return to the free plan
          </button>
        )}
      </div>
    </>
  );
}
