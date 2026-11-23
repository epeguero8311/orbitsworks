"use client";

import { clockEventTypeLabel, type OrderedEvent } from "@/lib/clockCorrection";
import type { PendingCorrection } from "@/lib/hooks/useClockEventDetail";

// "Adjust time" step 2 - same look and two buttons as the reassign
// confirm in ClockEventDetailModal. Nothing is saved until Confirm.

function formatMs(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function NeighbourLine({ label, event }: { label: string; event: OrderedEvent | null }) {
  return (
    <li>
      <span className="text-gray-500">{label}:</span>{" "}
      {event ? (
        <>
          {capitalize(clockEventTypeLabel(event.type))} at {formatMs(event.ms)}
        </>
      ) : (
        <span className="text-gray-500">none on this page</span>
      )}
    </li>
  );
}

export function CorrectionConfirm({
  pending,
  employeeName,
  submitting,
  onConfirm,
  onCancel,
}: {
  pending: PendingCorrection;
  employeeName: string;
  submitting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const typeLabel = clockEventTypeLabel(pending.target.type);
  return (
    <div className="mt-3 rounded-lg border-2 border-amber-300 bg-amber-50 p-4">
      <p className="text-sm font-medium text-gray-950">
        Change {employeeName}&apos;s {typeLabel} from{" "}
        <span className="font-semibold">{formatMs(pending.oldMs)}</span> to{" "}
        <span className="font-semibold">{formatMs(pending.newMs)}</span>?
      </p>
      <ul className="mt-2 space-y-0.5 text-xs text-gray-700">
        <NeighbourLine label="Before it" event={pending.neighbours.prev} />
        <NeighbourLine label="After it" event={pending.neighbours.next} />
      </ul>
      {pending.reason && (
        <p className="mt-2 text-xs text-gray-600">Reason: {pending.reason}</p>
      )}
      <p className="mt-2 text-xs text-gray-600">
        The original time stays in the history. Hours, reports and approvals use the new time.
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={submitting}
          onClick={onConfirm}
          className="rounded-md bg-accent px-4 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Saving..." : "Confirm"}
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={onCancel}
          className="rounded-md border border-gray-200 bg-white px-4 py-1.5 text-xs font-medium text-gray-600 hover:border-gray-300"
        >
          Back
        </button>
      </div>
    </div>
  );
}
