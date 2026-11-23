"use client";

import { useState } from "react";

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

// Small confirm modal. Shows the action's error inline instead of closing.
export function ConfirmDialog({ title, message, confirmLabel, danger, onConfirm, onClose }: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleConfirm() {
    setBusy(true);
    setError("");
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 px-4" onClick={busy ? undefined : onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-gray-950">{title}</h2>
        <p className="mt-2 text-sm text-gray-600">{message}</p>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-950 hover:border-gray-300 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={busy}
            className={`rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-60 ${
              danger ? "bg-red-600 hover:bg-red-700" : "bg-accent hover:bg-accent-hover"
            }`}
          >
            {busy ? "Working..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
