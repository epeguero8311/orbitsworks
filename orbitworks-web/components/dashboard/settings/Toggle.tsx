"use client";

import type { ReactNode } from "react";

export function Toggle({
  label,
  description,
  checked,
  onChange,
  disabled = false,
  badge,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  // Renders the switch inert (e.g. a Core company on a Pro-only toggle)
  // while still letting the caller wire up a click target via `badge`,
  // such as a PRO pill linking to /dashboard/billing.
  disabled?: boolean;
  badge?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-3.5">
      <div className="flex items-center gap-2 pr-4">
        <div>
          <p className="text-sm font-medium text-gray-950">{label}</p>
          {description && (
            <p className="mt-0.5 text-xs text-gray-600">{description}</p>
          )}
        </div>
        {badge}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
          checked ? "bg-accent" : "bg-gray-200"
        } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}
