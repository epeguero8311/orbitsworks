"use client";

import { ClockEvent } from "@/lib/types";
import { useAuth } from "@/lib/AuthContext";
import { useShiftCommentsByClockIn } from "@/lib/hooks/useShiftCommentsByClockIn";
import { useSiteExitsByClockIn } from "@/lib/hooks/useSiteExitsByClockIn";
import { SiteExitsNote } from "@/components/time/SiteExitsNote";
import { clockInIds, commentsForEvent } from "@/lib/shiftComments";
import { effectiveDate, sourceLabel } from "@/lib/clockEventDetailUtils";
import { faceCheckLabel } from "@/lib/clockStatus";
import { EventLocation } from "@/components/time/EventLocation";
import { GeofenceDetail } from "@/components/time/GeofenceDetail";
import { ClockPhotoBlock } from "@/components/time/ClockPhotoBlock";
import { AdjustTimeControl } from "@/components/dashboard/clockEventDetail/AdjustTimeControl";
import { AdjustmentHistoryList } from "@/components/dashboard/clockEventDetail/AdjustmentHistoryList";
import { ShiftCommentsNote } from "@/components/time/ShiftCommentsNote";

export function EventSide({
  label,
  event,
  isAdmin,
  adjustingId,
  onStartAdjust,
  onCancelAdjust,
  onSubmitAdjust,
  newTimeValue,
  onNewTimeChange,
  reasonValue,
  onReasonChange,
  submitting,
  errorMsg,
  showHistoryId,
  onToggleHistory,
}: {
  label: string;
  event: ClockEvent | null;
  isAdmin: boolean;
  adjustingId: string | null;
  onStartAdjust: (event: ClockEvent) => void;
  onCancelAdjust: () => void;
  onSubmitAdjust: (event: ClockEvent) => void;
  newTimeValue: string;
  onNewTimeChange: (v: string) => void;
  reasonValue: string;
  onReasonChange: (v: string) => void;
  submitting: boolean;
  errorMsg: string | null;
  showHistoryId: string | null;
  onToggleHistory: (id: string | null) => void;
}) {
  // Employee comments on this shift (Clock in side only).
  const { userData } = useAuth();
  const { commentsByClockIn } = useShiftCommentsByClockIn(userData?.companyId, clockInIds(event ? [event] : []));
  const comments = commentsForEvent(commentsByClockIn, event);
  // Phase 8: when they left the job site during this shift (Clock in side).
  const { exitsByClockIn } = useSiteExitsByClockIn(userData?.companyId, clockInIds(event ? [event] : []));
  const exits = event && event.type === "in" ? exitsByClockIn.get(event.id) ?? [] : [];

  if (!event) {
    const emptyMessage =
      label === "Clock out" ? "Still clocked in" : "No matching clock in";
    return (
      <div className="flex-1 rounded-lg border border-dashed border-gray-200 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-600">
          {label}
        </p>
        <p className="mt-3 text-sm text-gray-600">{emptyMessage}</p>
      </div>
    );
  }

  const badge = sourceLabel(event.source);
  const faceBadge = faceCheckLabel(event.faceCheck);
  // Admin/supervisor only, per spec - the whole Time Tracking page this
  // modal opens from is already admin/owner-only (supervisors are
  // redirected to /mobile-only), so `isAdmin` covers it; this check is
  // belt-and-suspenders if that ever changes.
  const showReferenceCompare =
    isAdmin &&
    (event.faceCheck?.status === "mismatch" || event.faceCheck?.status === "noFace");
  const isAdjusted = !!event.adjustedTimestamp;
  const hasHistory = !!event.adjustmentHistory && event.adjustmentHistory.length > 0;
  const displayDate = effectiveDate(event);
  const isShowingHistory = showHistoryId === event.id;

  return (
    <div className="flex-1 rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-600">
          {label}
        </p>
        {(isAdjusted || hasHistory) && (
          <button
            type="button"
            onClick={() => onToggleHistory(isShowingHistory ? null : event.id)}
            className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 hover:bg-amber-100"
          >
            Adjusted
          </button>
        )}
      </div>

      <ClockPhotoBlock event={event} label={label} showReferenceCompare={showReferenceCompare} />

      <p className="mt-3 font-mono text-sm text-gray-950">
        {displayDate ? displayDate.toLocaleString() : "-"}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
        >
          {badge.text}
        </span>
        {event.faceCheck && (
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${faceBadge.className}`}
          >
            {faceBadge.text}
          </span>
        )}
      </div>

      <EventLocation event={event} />
      <GeofenceDetail event={event} />

      {event.note && (
        <p className="mt-2 text-xs text-gray-600">Note: {event.note}</p>
      )}
      {event.employeeComment && (event.type === "in" || event.type === "out") && (
        <p className="mt-2 whitespace-pre-line text-xs text-gray-600">
          Employee comment: {event.employeeComment}
        </p>
      )}

      {comments.length > 0 && (
        <div className="mt-2">
          <ShiftCommentsNote comments={comments} />
        </div>
      )}

      {exits.length > 0 && (
        <div className="mt-2">
          <SiteExitsNote exits={exits} />
        </div>
      )}

      {isShowingHistory && hasHistory && (
        <AdjustmentHistoryList history={event.adjustmentHistory!} />
      )}

      {isAdmin && (
        <AdjustTimeControl
          event={event}
          adjustingId={adjustingId}
          onStartAdjust={onStartAdjust}
          onCancelAdjust={onCancelAdjust}
          onSubmitAdjust={onSubmitAdjust}
          newTimeValue={newTimeValue}
          onNewTimeChange={onNewTimeChange}
          reasonValue={reasonValue}
          onReasonChange={onReasonChange}
          submitting={submitting}
          errorMsg={errorMsg}
        />
      )}
    </div>
  );
}
