"use client";

import { AlertTriangle, X } from "lucide-react";
import type { DeactivatedBackfill } from "@/lib/hooks/useDashboardStatus";

export default function DeactivatedSessionsBanner({
  items,
  onDismiss,
}: {
  items: DeactivatedBackfill[];
  onDismiss: (key: string) => void;
}) {
  if (items.length === 0) return null;

  return (
    <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-600" />
        <div className="flex-1">
          <p className="text-sm font-medium text-red-900">
            Closed {items.length} orphaned session{items.length === 1 ? "" : "s"} for
            already-deactivated employees
          </p>
          <p className="mt-1 text-xs text-red-800">
            These employees were deactivated before this got fixed, so their
            session stayed open with no way to close it. It&apos;s been
            clocked out now, but hours for that day may be off since the
            real deactivation time wasn&apos;t recorded - double-check the
            report for that day.
          </p>
          <ul className="mt-2 space-y-1">
            {items.map((item) => (
              <li
                key={item.key}
                className="flex items-center justify-between gap-3 text-xs text-red-800"
              >
                <span>
                  {item.employeeName} - closed at{" "}
                  {item.closedAt.toLocaleString()}
                </span>
                <button
                  type="button"
                  onClick={() => onDismiss(item.key)}
                  className="text-red-700 hover:text-red-900"
                  aria-label={`Dismiss for ${item.employeeName}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
