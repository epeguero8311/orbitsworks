"use client";

import { useMemo, useState } from "react";
import { useTimesheetApprovals } from "@/lib/hooks/useTimesheetApprovals";
import { ApprovalsTable } from "@/components/dashboard/timesheetApprovals/ApprovalsTable";
import { ApprovalsHeader } from "@/components/dashboard/timesheetApprovals/ApprovalsHeader";
import AddTimestampModal from "@/components/dashboard/timesheetApprovals/AddTimestampModal";
import { dateKey, startOfWeek, APPROVALS_CUTOVER_DATE } from "@/lib/reportUtils";

function clampToCutover(d: string) {
  return d < APPROVALS_CUTOVER_DATE ? APPROVALS_CUTOVER_DATE : d;
}

function shiftDateKey(key: string, days: number) {
  const d = new Date(`${key}T00:00:00`);
  d.setDate(d.getDate() + days);
  return dateKey(d);
}

const CUTOVER_WEEK_START = dateKey(startOfWeek(new Date(`${APPROVALS_CUTOVER_DATE}T00:00:00`)));

export default function TimesheetApprovalsPage() {
  const [mode, setMode] = useState<"day" | "week">("day");
  const [date, setDate] = useState(() => clampToCutover(dateKey(new Date())));

  const weekStart = useMemo(() => dateKey(startOfWeek(new Date(`${date}T00:00:00`))), [date]);
  const weekEnd = useMemo(() => shiftDateKey(weekStart, 6), [weekStart]);
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => shiftDateKey(weekStart, i)),
    [weekStart]
  );

  const rangeStart = mode === "week" ? weekStart : date;
  const rangeEnd = mode === "week" ? weekEnd : date;

  const {
    rows,
    pendingCount,
    loading,
    addManualTimestamp,
    setApprovalStatus,
    setApprovalStatusBulk,
    deleteTimesheetSession,
  } = useTimesheetApprovals(rangeStart, rangeEnd);
  const [addingOpen, setAddingOpen] = useState(false);

  function applyDate(next: string) {
    setDate(clampToCutover(next));
  }

  function shiftRange(steps: number) {
    applyDate(shiftDateKey(date, mode === "week" ? steps * 7 : steps));
  }

  const atMin = mode === "week" ? weekStart <= CUTOVER_WEEK_START : date <= APPROVALS_CUTOVER_DATE;

  return (
    <div className="space-y-6">
      <ApprovalsHeader
        mode={mode}
        onModeChange={setMode}
        date={date}
        minDate={APPROVALS_CUTOVER_DATE}
        weekStart={weekStart}
        weekEnd={weekEnd}
        atMin={atMin}
        pendingCount={pendingCount}
        onShiftRange={shiftRange}
        onSetDate={applyDate}
      />

      <ApprovalsTable
        key={`${mode}-${rangeStart}-${rangeEnd}`}
        rows={rows}
        loading={loading}
        mode={mode}
        weekDays={mode === "week" ? weekDays : undefined}
        onSetStatus={setApprovalStatus}
        onSetStatusBulk={setApprovalStatusBulk}
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
