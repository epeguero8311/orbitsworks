"use client";

import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import { useClockEventDetail } from "@/lib/hooks/useClockEventDetail";
import type { ApprovalRow } from "@/lib/hooks/useTimesheetApprovals";
import type { ReassignClockSessionInput } from "@/lib/types";

function fmt(ms: number): string {
  return new Date(ms).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// Server errors carry overlap times as details (the server doesn't know
// the admin's time zone) - add them here in local time.
function reassignErrorText(err: unknown): string {
  const e = err as { message?: string; details?: { overlapStartMs?: number; overlapEndMs?: number | null } };
  const base = e?.message || "Couldn't change the employee. Nothing was moved.";
  const d = e?.details;
  if (d && typeof d.overlapStartMs === "number") {
    const span = d.overlapEndMs == null ? `from ${fmt(d.overlapStartMs)} (still open)` : `${fmt(d.overlapStartMs)} - ${fmt(d.overlapEndMs)}`;
    return `${base} Their time: ${span}.`;
  }
  return base;
}

// Timesheet Approvals > Session review. Time edits reuse Time Tracking's
// "Adjust time" flow as-is (useClockEventDetail: same two-step confirm,
// same correctClockEvent callable, same adjustmentHistory audit). The
// employee change moves the WHOLE session (reassignClockSession) instead
// of Time Tracking's single-event reassign. Approved sessions are
// read-only here and refused by the server too.
export function useSessionReview(row: ApprovalRow, status: "pending" | "approved") {
  const detail = useClockEventDetail({ event: row.clockInEvent, allEvents: row.employeeEvents });
  const isApproved = status === "approved";
  const canEdit = detail.isAdmin && !isApproved;

  const [pendingEmployeeId, setPendingEmployeeId] = useState<string | null>(null);
  const [reassignReason, setReassignReason] = useState("");
  const [reassignSubmitting, setReassignSubmitting] = useState(false);
  const [reassignError, setReassignError] = useState<string | null>(null);

  const employee = detail.activeEmployees.find((e) => e.id === row.employeeId);
  const pendingEmployeeName = pendingEmployeeId
    ? detail.activeEmployees.find((e) => e.id === pendingEmployeeId)?.name ?? "Unknown"
    : null;

  function pickEmployee(id: string) {
    if (!id || id === row.employeeId) return;
    setPendingEmployeeId(id);
    setReassignReason("");
    setReassignError(null);
  }

  function cancelReassign() {
    setPendingEmployeeId(null);
    setReassignError(null);
  }

  async function confirmReassign() {
    if (!pendingEmployeeId) return;
    setReassignSubmitting(true);
    setReassignError(null);
    try {
      const fn = httpsCallable<ReassignClockSessionInput, { success: boolean }>(functions, "reassignClockSession");
      const reason = reassignReason.trim();
      await fn({ clockInEventId: row.eventId, newEmployeeId: pendingEmployeeId, ...(reason ? { reason } : {}) });
      setPendingEmployeeId(null);
    } catch (err) {
      setReassignError(reassignErrorText(err));
    } finally {
      setReassignSubmitting(false);
    }
  }

  return {
    detail,
    isApproved,
    canEdit,
    referencePhotoUrl: employee?.photoUrl ?? null,
    activeEmployees: detail.activeEmployees,
    pendingEmployeeId,
    pendingEmployeeName,
    reassignReason,
    setReassignReason,
    reassignSubmitting,
    reassignError,
    pickEmployee,
    cancelReassign,
    confirmReassign,
  };
}
