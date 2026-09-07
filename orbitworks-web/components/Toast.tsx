"use client";

import { useEffect } from "react";
import { CheckCircle2, XCircle, X } from "lucide-react";

export type ToastVariant = "success" | "error";

export function Toast({
  visible,
  onClose,
  message,
  variant = "error",
}: {
  visible: boolean;
  onClose: () => void;
  message: string;
  variant?: ToastVariant;
}) {
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(onClose, 6000);
    return () => clearTimeout(timer);
  }, [visible, onClose]);

  if (!visible) return null;

  const isError = variant === "error";

  return (
    <div className="fixed inset-x-4 top-4 z-50 sm:inset-x-auto sm:right-6 sm:top-6 sm:w-96">
      <div className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-lg animate-in slide-in-from-bottom-4 fade-in duration-300">
        <div
          className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${
            isError ? "bg-red-50" : "bg-accent/10"
          }`}
        >
          {isError ? (
            <XCircle className="h-4 w-4 text-red-600" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-accent" />
          )}
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-950">{message}</p>
        </div>
        <button
          onClick={onClose}
          className="flex-shrink-0 rounded-md p-1 text-gray-400 hover:bg-gray-50 hover:text-gray-600"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
