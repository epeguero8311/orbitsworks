"use client";

import { useState } from "react";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { auth } from "@/lib/firebase";

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY as string
);

function UpdateForm({ onSuccess }: { onSuccess: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements || !auth.currentUser) return;

    setError("");
    setIsSubmitting(true);

    const { error: confirmError, setupIntent } = await stripe.confirmSetup({
      elements,
      confirmParams: { return_url: window.location.href },
      redirect: "if_required",
    });

    if (confirmError || !setupIntent || typeof setupIntent.payment_method !== "string") {
      setError(confirmError?.message || "Couldn't save the new card. Try again.");
      setIsSubmitting(false);
      return;
    }

    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch("/api/stripe/update-payment-method", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ paymentMethodId: setupIntent.payment_method }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Couldn't update payment method.");
      }
      setIsSubmitting(false);
      onSuccess();
    } catch (err: any) {
      console.error("Update payment method error:", err);
      setError(err.message || "Couldn't update payment method. Try again.");
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement />
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={!stripe || isSubmitting}
        className="mt-5 w-full rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
      >
        {isSubmitting ? "Saving..." : "Save card & retry payment"}
      </button>
    </form>
  );
}

export default function UpdatePaymentModal({
  clientSecret,
  onClose,
  onSuccess,
}: {
  clientSecret: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-6 shadow-lg">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-950">
            Update payment method
          </h2>
          <button
            onClick={onClose}
            className="text-sm text-gray-600 hover:text-gray-950"
          >
            Cancel
          </button>
        </div>
        <Elements stripe={stripePromise} options={{ clientSecret }}>
          <UpdateForm onSuccess={onSuccess} />
        </Elements>
      </div>
    </div>
  );
}
