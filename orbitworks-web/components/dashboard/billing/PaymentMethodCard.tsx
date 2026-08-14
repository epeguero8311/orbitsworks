"use client";

import type { PaymentMethodInfo } from "@/lib/hooks/usePaymentMethod";

function formatBrand(brand: string): string {
  const map: Record<string, string> = {
    visa: "Visa",
    mastercard: "Mastercard",
    amex: "American Express",
    discover: "Discover",
    diners: "Diners Club",
    jcb: "JCB",
    unionpay: "UnionPay",
  };
  return map[brand] ?? brand.charAt(0).toUpperCase() + brand.slice(1);
}

type Props = {
  paymentMethod: PaymentMethodInfo;
  loading: boolean;
  error: string;
  busy: boolean;
  onUpdateClick: () => void;
};

export default function PaymentMethodCard({
  paymentMethod,
  loading,
  error,
  busy,
  onUpdateClick,
}: Props) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="text-base font-semibold text-gray-950">Payment method</h2>

      {loading ? (
        <p className="mt-2 text-sm text-gray-600">Loading...</p>
      ) : error ? (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      ) : paymentMethod ? (
        <p className="mt-2 text-sm text-gray-950">
          {formatBrand(paymentMethod.brand)} ending in {paymentMethod.last4}
          <span className="ml-2 text-gray-600">
            Exp {String(paymentMethod.expMonth).padStart(2, "0")}/{paymentMethod.expYear}
          </span>
        </p>
      ) : (
        <p className="mt-2 text-sm text-gray-600">No card on file yet.</p>
      )}

      <button
        type="button"
        disabled={busy}
        onClick={onUpdateClick}
        className="mt-4 rounded-lg border border-accent px-4 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Loading..." : paymentMethod ? "Update card" : "Add card"}
      </button>
    </div>
  );
}