"use client";

import { useState } from "react";

export default function ConfirmDeleteSessionModal({
  employeeName,
  dateLabel,
  onClose,
  onConfirm,
}: {
  employeeName: string;
  dateLabel: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleConfirm() {
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to delete this session.");
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl bg-white p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-gray-950">Delete this session?</h2>
        <p className="mt-2 text-sm text-gray-600">
          This permanently removes {employeeName}&apos;s clock in/out (and any break) for{" "}
          {dateLabel}. This can&apos;t be undone.
        </p>
        {errorMsg && <p className="mt-2 text-xs text-red-600">{errorMsg}</p>}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={submitting}
            onClick={handleConfirm}
            className="rounded-md bg-red-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Deleting..." : "Delete permanently"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-200 bg-white px-4 py-1.5 text-xs font-medium text-gray-600 hover:border-gray-300"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}