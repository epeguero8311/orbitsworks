"use client";

import { useState } from "react";
import { useTimesheetApprovals } from "@/lib/hooks/useTimesheetApprovals";
import { ApprovalsTable } from "@/components/dashboard/timesheetApprovals/ApprovalsTable";
import { ApprovalsDayHeader } from "@/components/dashboard/timesheetApprovals/ApprovalsDayHeader";
import AddTimestampModal from "@/components/dashboard/timesheetApprovals/AddTimestampModal";
import { localDateKey, APPROVALS_CUTOVER_DATE } from "@/lib/reportUtils";

function clampToCutover(d: string) {
  return d < APPROVALS_CUTOVER_DATE ? APPROVALS_CUTOVER_DATE : d;
}

export default function TimesheetApprovalsPage() {
  const [date, setDate] = useState(() => clampToCutover(localDateKey(new Date())));
  const {
    rows,
    pendingCount,
    loading,
    addManualTimestamp,
    setApprovalStatus,
    deleteTimesheetSession,
  } = useTimesheetApprovals(date);
  const [addingOpen, setAddingOpen] = useState(false);

  function applyDate(next: string) {
    setDate(clampToCutover(next));
  }

  function shiftDay(days: number) {
    const d = new Date(`${date}T00:00:00`);
    d.setDate(d.getDate() + days);
    applyDate(localDateKey(d));
  }

  return (
    <div className="space-y-6">
      <ApprovalsDayHeader
        date={date}
        minDate={APPROVALS_CUTOVER_DATE}
        pendingCount={pendingCount}
        onShiftDay={shiftDay}
        onSetDate={applyDate}
      />

      <ApprovalsTable
        rows={rows}
        loading={loading}
        onSetStatus={setApprovalStatus}
        onDeleteSession={deleteTimesheetSession}
        onAddTimestamp={() => setAddingOpen(true)}
      />

      {addingOpen && (
        <AddTimestampModal
          defaultDate={date}
          minDate={APPROVALS_CUTOVER_DATE}
          onClose={() => setAddingOpen(false)}
          onSubmit={addManualTimestamp}
        />
      )}
    </div>
  );
}