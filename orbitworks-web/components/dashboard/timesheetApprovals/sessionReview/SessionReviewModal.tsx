"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ApprovalRow } from "@/lib/hooks/useTimesheetApprovals";
import type { JobSite } from "@/lib/types";
import { useSessionReview } from "@/lib/hooks/useSessionReview";
import { breakLine, sessionBreaks } from "@/lib/sessionReview";
import { ReferencePhoto } from "@/components/time/ReferencePhoto";
import { EmployeeReassignDropdown } from "@/components/dashboard/clockEventDetail/EmployeeReassignDropdown";
import { CorrectionConfirm } from "@/components/dashboard/clockEventDetail/CorrectionConfirm";
import { AdjustTimeControl, type AdjustTimeProps } from "@/components/dashboard/clockEventDetail/AdjustTimeControl";
import { SessionPhotoCard } from "./SessionPhotoCard";
import { SessionMapPanel } from "./SessionMapPanel";
import { SessionComments } from "./SessionComments";
import { SessionAlerts } from "./SessionAlerts";
import { SessionTips } from "./SessionTips";

type Status = "pending" | "approved";

type Props = {
  row: ApprovalRow;
  // The same employee's sessions that day, in clock-in order (includes row).
  siblings: ApprovalRow[];
  status: Status;
  sites: JobSite[];
  onSelectRow: (key: string) => void;
  onSetStatus: (status: Status) => Promise<void>;
  onAssignSite: (siteId: string) => Promise<void>;
  // Tips (Task 3): field shown only while the company's Tips toggle is ON.
  tipsEnabled: boolean;
  onSaveTip: (amountCents: number) => Promise<void>;
  onClose: () => void;
};

// Timesheet Approvals > Session review. Opens from the row, the shield and
// the comment icon. The body is keyed by session so stepping to another
// session (prev/next) starts with clean edit state.
export default function SessionReviewModal(props: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={props.onClose}>
      <div
        className="max-h-[92vh] w-full max-w-[1100px] overflow-y-auto rounded-xl bg-white p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <SessionReviewBody key={props.row.key} {...props} />
      </div>
    </div>
  );
}

function SessionReviewBody({
  row,
  siblings,
  status,
  sites,
  onSelectRow,
  onSetStatus,
  onAssignSite,
  tipsEnabled,
  onSaveTip,
  onClose,
}: Props) {
  const r = useSessionReview(row, status);
  const d = r.detail;
  const [statusSubmitting, setStatusSubmitting] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  const index = siblings.findIndex((s) => s.key === row.key);
  const prev = index > 0 ? siblings[index - 1] : null;
  const next = index >= 0 && index < siblings.length - 1 ? siblings[index + 1] : null;

  const dateLabel = new Date(`${row.date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const breaks = sessionBreaks(row.sessionEvents);

  const adjust: AdjustTimeProps = {
    adjustingId: d.adjustingId,
    onStartAdjust: d.handleStartAdjust,
    onCancelAdjust: d.handleCancelAdjust,
    onSubmitAdjust: d.handleSubmitAdjust,
    newTimeValue: d.newTimeValue,
    onNewTimeChange: d.setNewTimeValue,
    reasonValue: d.reasonValue,
    onReasonChange: d.setReasonValue,
    submitting: d.submitting,
    errorMsg: d.errorMsg,
  };

  async function changeStatus(next: Status) {
    setStatusSubmitting(true);
    setStatusError(null);
    try {
      await onSetStatus(next);
    } catch {
      setStatusError(next === "approved" ? "Couldn't approve. Try again." : "Couldn't set to Pending. Try again.");
    } finally {
      setStatusSubmitting(false);
    }
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-gray-100">
            <ReferencePhoto url={r.referencePhotoUrl} alt={`${row.employeeName} reference photo`} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-600">Session review</p>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-gray-950">{row.employeeName}</h2>
              {r.canEdit && (
                <EmployeeReassignDropdown currentEmployeeId={row.employeeId} employees={r.activeEmployees} onPick={r.pickEmployee} />
              )}
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  status === "approved" ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"
                }`}
              >
                {status === "approved" ? "Approved" : "Pending"}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-gray-600">
              {dateLabel} - {row.siteName}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {siblings.length > 1 && (
            <>
              <button
                type="button"
                disabled={!prev}
                onClick={() => prev && onSelectRow(prev.key)}
                className="rounded-md p-1 text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-300 disabled:hover:bg-transparent"
                aria-label="Previous session"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs text-gray-600">
                {index + 1} of {siblings.length}
              </span>
              <button
                type="button"
                disabled={!next}
                onClick={() => next && onSelectRow(next.key)}
                className="rounded-md p-1 text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-300 disabled:hover:bg-transparent"
                aria-label="Next session"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {r.isApproved && d.isAdmin && (
        <p className="mt-3 rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-600">
          This session is approved. Set it to Pending to edit times or change the employee.
        </p>
      )}

      {r.pendingEmployeeId && (
        <div className="mt-3 rounded-lg border-2 border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-medium text-gray-950">
            Move this whole session from <span className="font-semibold">{row.employeeName}</span> to{" "}
            <span className="font-semibold">{r.pendingEmployeeName}</span>?
          </p>
          <p className="mt-1 text-xs text-gray-600">
            The clock in, clock out and breaks all move together; the times stay the same. The face check runs again against{" "}
            {r.pendingEmployeeName}&apos;s reference photo.
          </p>
          <input
            type="text"
            value={r.reassignReason}
            onChange={(e) => r.setReassignReason(e.target.value)}
            placeholder="Reason (optional), e.g. Used the wrong PIN"
            maxLength={500}
            className="mt-2 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm"
          />
          {r.reassignError && <p className="mt-2 text-xs text-red-600">{r.reassignError}</p>}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={r.reassignSubmitting}
              onClick={r.confirmReassign}
              className="rounded-md bg-accent px-4 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {r.reassignSubmitting ? "Moving..." : "Move session"}
            </button>
            <button
              type="button"
              disabled={r.reassignSubmitting}
              onClick={r.cancelReassign}
              className="rounded-md border border-gray-200 bg-white px-4 py-1.5 text-xs font-medium text-gray-600 hover:border-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {d.pendingCorrection && (
        <CorrectionConfirm
          pending={d.pendingCorrection}
          employeeName={row.employeeName}
          submitting={d.submitting}
          onConfirm={d.handleConfirmCorrection}
          onCancel={d.handleCancelCorrection}
        />
      )}

      {/* Body: main area + Session Alerts column */}
      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SessionPhotoCard label="Clock in" event={row.clockInEvent} canEdit={r.canEdit} adjust={adjust} />
            <SessionPhotoCard label="Clock out" event={row.clockOutEvent} canEdit={r.canEdit} adjust={adjust} />
          </div>

          {breaks.length > 0 && (
            <div className="mt-3 space-y-1">
              {breaks.map((b) => (
                <div key={b.start.id} className="flex flex-wrap items-baseline gap-x-3 text-xs text-gray-600">
                  <span>{breakLine(b)}</span>
                  {r.canEdit && (
                    <>
                      <span className="[&>div]:mt-0">
                        <AdjustTimeControl event={b.start} linkText="Adjust start" {...adjust} />
                      </span>
                      {b.end && (
                        <span className="[&>div]:mt-0">
                          <AdjustTimeControl event={b.end} linkText="Adjust end" {...adjust} />
                        </span>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <SessionMapPanel clockIn={row.clockInEvent} clockOut={row.clockOutEvent} />
            <SessionComments
              clockIn={row.clockInEvent}
              clockOut={row.clockOutEvent}
              punchComments={row.punchComments}
              comments={row.comments}
            />
          </div>
        </div>

        <div>
          {/* Tips (Task 3, D10 recon): admin/owner only, editable whether
              the session is pending or approved - never changes approval. */}
          {tipsEnabled && d.isAdmin && (
            <div className="mb-4">
              <SessionTips
                clockInEventId={row.eventId}
                tipCents={row.tipCents}
                lastEditedByName={row.tipUpdatedByName}
                onSave={onSaveTip}
              />
            </div>
          )}
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-600">Session Alerts</p>
          <SessionAlerts
            warnings={row.warnings}
            siteExits={row.siteExits}
            siteName={row.siteName}
            sites={sites}
            onAssignSite={onAssignSite}
            canEdit={r.canEdit}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="mt-6 flex flex-wrap items-center justify-end gap-2 border-t border-gray-200 pt-4">
        {statusError && <p className="mr-auto text-xs text-red-600">{statusError}</p>}
        {status === "approved" ? (
          <button
            type="button"
            disabled={statusSubmitting}
            onClick={() => changeStatus("pending")}
            className="rounded-md border border-gray-200 bg-white px-4 py-1.5 text-xs font-semibold text-gray-950 hover:border-gray-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {statusSubmitting ? "Saving..." : "Set to Pending"}
          </button>
        ) : (
          <button
            type="button"
            disabled={statusSubmitting}
            onClick={() => changeStatus("approved")}
            className="rounded-md bg-accent px-4 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {statusSubmitting ? "Approving..." : "Approve"}
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-gray-200 bg-white px-4 py-1.5 text-xs font-medium text-gray-600 hover:border-gray-300"
        >
          Close
        </button>
      </div>
    </>
  );
}
