"use client";

import { ClockEvent } from "@/lib/types";

// A clock event's audit trail (adjustmentHistory: who, when, old -> new,
// reason), newest first. Pulled out of EventSide (same markup) so
// Timesheet Approvals > Session review shows it the same way.
export function AdjustmentHistoryList({ history }: { history: NonNullable<ClockEvent["adjustmentHistory"]> }) {
  return (
    <div className="mt-3 space-y-2 rounded-md bg-gray-50 p-3">
      <p className="text-xs font-medium text-gray-950">Adjustment history</p>
      {history
        .slice()
        .reverse()
        .map((adj, i) => (
          <div key={i} className="text-xs text-gray-600">
            {adj.fieldChanged === "employeeId" ? (
              <p>
                Reassigned from {String(adj.previousValue)} to{" "}
                {String(adj.newValue)}
              </p>
            ) : (
              <p>
                {(adj.previousValue as ClockEvent["timestamp"])!
                  .toDate()
                  .toLocaleString()}{" "}
                to{" "}
                {(adj.newValue as ClockEvent["timestamp"])!
                  .toDate()
                  .toLocaleString()}
              </p>
            )}
            <p className="text-gray-500">
              by {adj.changedByName} on{" "}
              {adj.changedAt.toDate().toLocaleString()}
              {adj.reason ? ` - ${adj.reason}` : ""}
            </p>
          </div>
        ))}
    </div>
  );
}
