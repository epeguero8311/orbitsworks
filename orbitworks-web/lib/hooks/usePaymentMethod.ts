"use client";

import { useEffect, useState, useCallback } from "react";
import { auth } from "@/lib/firebase";

export type PaymentMethodInfo = {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
} | null;

export function usePaymentMethod(companyId: string | undefined) {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodInfo>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!auth.currentUser || !companyId) {
      setLoading(false);
      return;
    }
    setError("");
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch("/api/stripe/payment-method", {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't load payment method.");
      setPaymentMethod(data.paymentMethod ?? null);
    } catch (err: any) {
      console.error("Load payment method error:", err);
      setError(err.message || "Couldn't load payment method.");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    load();
  }, [load]);

  return { paymentMethod, loading, error, reload: load };
}