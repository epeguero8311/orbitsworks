"use client";

import { useState } from "react";

type Props = {
  pendingLabel?: string | null;
  onApply: (code: string) => Promise<void>;
};

export default function PromoCodeCard({ pendingLabel, onApply }: Props) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await onApply(code.trim());
      setMessage("Promo applied.");
      setCode("");
    } catch (err: any) {
      setError(err.message || "Couldn't apply that code.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="text-base font-semibold text-gray-950">Promo code</h2>

      {pendingLabel && (
        <p className="mt-2 rounded-lg bg-accent/10 px-3.5 py-2 text-xs font-medium text-accent">
          {pendingLabel} will be applied when you pick a plan below.
        </p>
      )}

      <form onSubmit={handleSubmit} className="mt-3 flex gap-2">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Enter code"
          className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-950 placeholder:text-gray-400 focus:border-accent focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || !code.trim()}
          className="rounded-lg border border-accent px-4 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Applying..." : "Apply"}
        </button>
      </form>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {message && !error && <p className="mt-2 text-sm text-green-700">{message}</p>}
    </div>
  );
}