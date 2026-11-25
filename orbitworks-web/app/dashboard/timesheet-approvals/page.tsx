"use client";

import { useMemo, useState } from "react";
import { useTimesheetApprovals } from "@/lib/hooks/useTimesheetApprovals";
import { useJobs } from "@/lib/hooks/useJobs";
import { ApprovalsTable } from "@/components/dashboard/timesheetApprovals/ApprovalsTable";
import { ApprovalsHeader } from "@/components/dashboard/timesheetApprovals/ApprovalsHeader";
import AddTimestampModal from "@/components/dashboard/timesheetApprovals/AddTimestampModal";
import ColumnsModal from "@/components/dashboard/timesheetApprovals/ColumnsModal";
import { useApprovalsColumns } from "@/lib/hooks/useApprovalsColumns";
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
    assignSessionSite,
    setShiftTip,
  } = useTimesheetApprovals(rangeStart, rangeEnd);
  const { jobs } = useJobs();
  const [addingOpen, setAddingOpen] = useState(false);
  // Task 2: the company's Approve Hours columns (Columns modal).
  const approvalsColumns = useApprovalsColumns();
  const [columnsOpen, setColumnsOpen] = useState(false);

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
        // Also wait for the company's columns, so a custom set never
        // flashes the default columns first.
        loading={loading || approvalsColumns.loading}
        mode={mode}
        weekDays={mode === "week" ? weekDays : undefined}
        jobs={jobs}
        onSetStatus={setApprovalStatus}
        onSetStatusBulk={setApprovalStatusBulk}
        onDeleteSession={deleteTimesheetSession}
        onAssignSite={assignSessionSite}
        onAddTimestamp={() => setAddingOpen(true)}
        columns={approvalsColumns.visible}
        onOpenColumns={() => setColumnsOpen(true)}
        tipsEnabled={approvalsColumns.tipsEnabled}
        onSetTip={setShiftTip}
      />

      {addingOpen && (
        <AddTimestampModal
          defaultDate={date}
          minDate={APPROVALS_CUTOVER_DATE}
          onClose={() => setAddingOpen(false)}
          onSubmit={addManualTimestamp}
        />
      )}

      {columnsOpen && (
        <ColumnsModal
          selected={approvalsColumns.selected}
          isPro={approvalsColumns.isPro}
          overtimeEnabled={approvalsColumns.overtimeEnabled}
          tipsEnabled={approvalsColumns.tipsEnabled}
          onClose={() => setColumnsOpen(false)}
          onSave={approvalsColumns.save}
        />
      )}
    </div>
  );
}
