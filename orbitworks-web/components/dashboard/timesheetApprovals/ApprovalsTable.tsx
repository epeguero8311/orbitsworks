"use client";

import { useEffect, useRef, useState } from "react";
import { Pencil, Trash2, Plus, ShieldAlert } from "lucide-react";
import type { ApprovalRow } from "@/lib/hooks/useTimesheetApprovals";
import type { ClockEvent, Job } from "@/lib/types";
import { useSites } from "@/lib/hooks/useSites";
import { worstSeverity } from "@/lib/sessionWarnings";
import ClockEventDetailModal from "@/components/dashboard/ClockEventDetailModal";
import ConfirmDeleteSessionModal from "@/components/dashboard/timesheetApprovals/ConfirmDeleteSessionModal";
import SessionWarningsModal from "@/components/dashboard/timesheetApprovals/SessionWarningsModal";

function formatHours(hours: number | null) {
  if (hours == null) return "-";
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h ${m}m`;
}

function formatWorked(shiftHours: number | null, breakHours: number | null) {
  if (shiftHours == null) return "-";
  return formatHours(shiftHours - (breakHours ?? 0));
}

function formatTime(event: ClockEvent) {
  const ts = event.adjustedTimestamp ?? event.timestamp;
  if (!ts) return "-";
  return ts.toDate().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function formatDayLabel(dateKeyStr: string) {
  return new Date(`${dateKeyStr}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// The table has no minimum width - it is always exactly 100% of its card,
// on any desktop window, so it can never need a horizontal scrollbar. A
// forced minimum here was what caused one: on a card narrower than that
// minimum, the table stayed at the minimum instead of shrinking, and the
// wrapper's overflow-x-auto kicked in. The overflow-x-auto wrapper stays
// only as a fallback for genuinely tiny (phone-width) viewports.

// The checkbox column is a fixed 40px - it never needs to grow with the
// window. Every other column is a percentage of the table's own width, but
// scaled down by the same 40px (via calc) so the full set of columns,
// fixed column included, always sums to exactly 100% of the container.
// Without that adjustment, a plain "9%" + a hardcoded "40px" column would
// not add up to 100% and the table would either overflow its card or fall
// short of it.
const CHECKBOX_COLUMN_WIDTH = "40px";
const CHECKBOX_COLUMN_PX = 40;

function scaledWidth(percent: number): string {
  const reservedPx = (percent * CHECKBOX_COLUMN_PX) / 100;
  return `calc(${percent}% - ${reservedPx}px)`;
}

// Target percentages (of the full table width) for every column after the
// fixed checkbox column. Day mode has no Date column, so its Name/Company
// pick up the width Date would have used. Both variants total 100. Status
// gets 20% on both - paired with the tightened, shrink-0 select and icon
// buttons below, that is enough for "Approved" plus the chevron and both
// icon buttons on a normal desktop window without forcing the table wider
// than its card.
// Job sits right after Site (same "where/what" grouping) and before Time.
// Its 12% comes out of Time (-6), Status (-3), Shift/Break/Worked (-1
// each), so every other column just gets a little tighter rather than the
// layout being redone - Status still fits "Approved" + the chevron + both
// icon buttons on a normal desktop window.
const DAY_PERCENTAGES = {
  name: 15,
  company: 11,
  site: 10,
  job: 12,
  time: 14,
  shift: 7,
  breakCol: 7,
  worked: 7,
  status: 17,
};
const WEEK_PERCENTAGES = {
  date: 8,
  name: 12,
  company: 10,
  site: 10,
  job: 12,
  time: 10,
  shift: 7,
  breakCol: 7,
  worked: 7,
  status: 17,
};

function buildColumnWidths(mode: "day" | "week"): string[] {
  if (mode === "week") {
    const p = WEEK_PERCENTAGES;
    return [
      CHECKBOX_COLUMN_WIDTH,
      scaledWidth(p.date),
      scaledWidth(p.name),
      scaledWidth(p.company),
      scaledWidth(p.site),
      scaledWidth(p.job),
      scaledWidth(p.time),
      scaledWidth(p.shift),
      scaledWidth(p.breakCol),
      scaledWidth(p.worked),
      scaledWidth(p.status),
    ];
  }
  const p = DAY_PERCENTAGES;
  return [
    CHECKBOX_COLUMN_WIDTH,
    scaledWidth(p.name),
    scaledWidth(p.company),
    scaledWidth(p.site),
    scaledWidth(p.job),
    scaledWidth(p.time),
    scaledWidth(p.shift),
    scaledWidth(p.breakCol),
    scaledWidth(p.worked),
    scaledWidth(p.status),
  ];
}

export function ApprovalsTable({
  rows,
  loading,
  mode,
  weekDays,
  jobs,
  onSetStatus,
  onSetStatusBulk,
  onDeleteSession,
  onAssignSite,
  onAddTimestamp,
}: {
  rows: ApprovalRow[];
  loading: boolean;
  mode: "day" | "week";
  weekDays?: string[];
  jobs: Job[];
  onSetStatus: (
    eventId: string,
    status: "pending" | "approved",
    jobId?: string | null
  ) => Promise<void>;
  onSetStatusBulk: (
    eventIds: string[],
    status: "pending" | "approved",
    jobIdByEventId?: Record<string, string | null>
  ) => Promise<void>;
  onDeleteSession: (approvalId: string, eventIds: string[]) => Promise<void>;
  onAssignSite: (approvalId: string, eventIds: string[], siteId: string) => Promise<void>;
  onAddTimestamp: () => void;
}) {
  const { sites } = useSites();
  const [editingRow, setEditingRow] = useState<ApprovalRow | null>(null);
  const [deletingRow, setDeletingRow] = useState<ApprovalRow | null>(null);
  const [viewingWarningsRow, setViewingWarningsRow] = useState<ApprovalRow | null>(null);
  // setApprovalStatus is a Cloud Function - the first call after it's been
  // idle pays a cold-start delay (several seconds, sometimes more), which
  // otherwise leaves the dropdown looking stuck since it only reflects
  // Firestore's real value once the listener catches up. Showing the
  // chosen status immediately (reverted on failure, reconciled below once
  // the real value arrives) makes every change feel instant regardless of
  // that round-trip time.
  const [optimisticStatus, setOptimisticStatus] = useState<
    Map<string, "pending" | "approved">
  >(new Map());
  // Job picked in the dropdown but not yet saved - "" means "(Default)".
  // Only written to the approval doc when the row's status becomes
  // approved (see handleStatusChange/approveAllSelected), so picking a Job
  // on a still-pending row never fires a network call by itself.
  const [pendingJobId, setPendingJobId] = useState<Map<string, string>>(new Map());
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const headerCheckboxRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setOptimisticStatus((prev) => {
      if (prev.size === 0) return prev;
      let changed = false;
      const next = new Map(prev);
      for (const row of rows) {
        if (next.get(row.key) === row.status) {
          next.delete(row.key);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    setPendingJobId((prev) => {
      if (prev.size === 0) return prev;
      let changed = false;
      const next = new Map(prev);
      for (const row of rows) {
        if (next.has(row.key) && next.get(row.key) === (row.jobId ?? "")) {
          next.delete(row.key);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    setSelectedKeys((prev) => {
      if (prev.size === 0) return prev;
      const validKeys = new Set(rows.map((r) => r.key));
      let changed = false;
      const next = new Set(prev);
      for (const key of prev) {
        if (!validKeys.has(key)) {
          next.delete(key);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [rows]);

  const allSelected = rows.length > 0 && rows.every((r) => selectedKeys.has(r.key));
  const someSelected = rows.some((r) => selectedKeys.has(r.key));

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = someSelected && !allSelected;
    }
  }, [someSelected, allSelected]);

  function toggleRowSelected(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedKeys(allSelected ? new Set() : new Set(rows.map((r) => r.key)));
  }

  function cancelSelection() {
    setSelectedKeys(new Set());
  }

  function effectiveJobId(row: ApprovalRow): string {
    return pendingJobId.get(row.key) ?? row.jobId ?? "";
  }

  // "(Default)" shows the employee's actually assigned job (by current
  // name, even if that job was since deactivated) rather than a generic
  // placeholder, or "Not specified" when the employee has no job assigned.
  function defaultJobLabel(row: ApprovalRow): string {
    if (!row.defaultJobId) return "Not specified";
    return jobs.find((j) => j.id === row.defaultJobId)?.name ?? "Not specified";
  }

  async function approveAllSelected() {
    const keys = Array.from(selectedKeys);
    if (keys.length === 0) return;
    setBulkSubmitting(true);
    setOptimisticStatus((prev) => {
      const next = new Map(prev);
      keys.forEach((key) => next.set(key, "approved"));
      return next;
    });
    // row.key is the clock-in event id (same value as row.eventId), so it
    // can be used directly as the bulk call's eventIds list.
    const jobIdByEventId: Record<string, string | null> = {};
    rows
      .filter((r) => selectedKeys.has(r.key))
      .forEach((r) => {
        jobIdByEventId[r.eventId] = effectiveJobId(r) || null;
      });
    try {
      await onSetStatusBulk(keys, "approved", jobIdByEventId);
      setSelectedKeys(new Set());
    } catch (err) {
      console.error("Failed to approve selected rows:", err);
      setOptimisticStatus((prev) => {
        const next = new Map(prev);
        keys.forEach((key) => next.delete(key));
        return next;
      });
    } finally {
      setBulkSubmitting(false);
    }
  }

  async function handleStatusChange(row: ApprovalRow, status: "pending" | "approved") {
    setOptimisticStatus((prev) => new Map(prev).set(row.key, status));
    try {
      await onSetStatus(row.eventId, status, status === "approved" ? effectiveJobId(row) || null : undefined);
    } catch (err) {
      console.error("Failed to update approval status:", err);
      setOptimisticStatus((prev) => {
        const next = new Map(prev);
        next.delete(row.key);
        return next;
      });
    }
  }

  async function handleJobChange(row: ApprovalRow, jobId: string) {
    setPendingJobId((prev) => new Map(prev).set(row.key, jobId));
    // The row is already approved - there is no further "approve" action
    // that would otherwise save this correction, so save it right away.
    const displayStatus = optimisticStatus.get(row.key) ?? row.status;
    if (displayStatus === "approved") {
      try {
        await onSetStatus(row.eventId, "approved", jobId || null);
      } catch (err) {
        console.error("Failed to save job for approved row:", err);
      }
    }
  }

  const editEvents: ClockEvent[] = editingRow
    ? [editingRow.clockInEvent, editingRow.clockOutEvent]
    : [];

  // checkbox + (Date in week mode) + Name/Company/Site/Job/Time/Shift/Break/
  // Worked/Status - the pencil/trash actions live inside the Status cell,
  // not a column of their own, so there is no separate actions column here.
  const columnCount = mode === "week" ? 11 : 10;
  const activeJobs = jobs.filter((j) => j.active);
  const columnWidths = buildColumnWidths(mode);

  function renderRow(row: ApprovalRow) {
    const worst = worstSeverity(row.warnings);
    const displayStatus = optimisticStatus.get(row.key) ?? row.status;
    const highlightWarning = worst != null && displayStatus === "pending";
    const highlightClass = highlightWarning ? (worst === "red" ? "bg-red-50" : "bg-amber-50") : "bg-white";
    return (
      <tr
        key={row.key}
        className={`border-b border-gray-200 last:border-0 ${highlightClass}`}
      >
        <td className="px-6 py-5">
          <input
            type="checkbox"
            checked={selectedKeys.has(row.key)}
            onChange={() => toggleRowSelected(row.key)}
            aria-label={`Select ${row.employeeName}`}
            className="h-4 w-4 rounded border-gray-300"
          />
        </td>
        {mode === "week" && (
          <td className="px-6 py-5 text-gray-600">{formatDayLabel(row.date)}</td>
        )}
        <td className="px-6 py-5 font-medium text-gray-950">
          <span className="flex flex-wrap items-center gap-2">
            {row.employeeName}
            {row.isClockedInNow && (
              <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">
                Clocked In
              </span>
            )}
            {worst != null && (
              <button
                type="button"
                onClick={() => setViewingWarningsRow(row)}
                className={`inline-flex items-center justify-center rounded-full p-1 transition-transform hover:scale-110 ${
                  worst === "red"
                    ? "bg-red-100 text-red-700 hover:bg-red-200"
                    : "bg-amber-100 text-amber-700 hover:bg-amber-200"
                }`}
                title="Click to see warnings"
                aria-label="Click to see warnings"
              >
                <ShieldAlert className="h-3.5 w-3.5" />
              </button>
            )}
          </span>
        </td>
        <td className="px-6 py-5 text-gray-600">
          {row.isSubcontractor ? (
            <span className="inline-flex items-center rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-medium text-purple-700">
              {row.companyName}
            </span>
          ) : (
            row.companyName
          )}
        </td>
        <td className="px-6 py-5 text-gray-600">{row.siteName}</td>
        <td className="px-6 py-5">
          <select
            value={effectiveJobId(row)}
            onChange={(e) => handleJobChange(row, e.target.value)}
            className="w-full max-w-[160px] rounded-md border border-gray-200 px-2 py-1.5 text-xs text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          >
            <option value="">{defaultJobLabel(row)}</option>
            {activeJobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.name}
              </option>
            ))}
          </select>
        </td>
        <td className="px-6 py-5 font-mono text-xs text-gray-600">
          {formatTime(row.clockInEvent)} - {formatTime(row.clockOutEvent)}
        </td>
        <td className="px-6 py-5 text-gray-600">{formatHours(row.hours)}</td>
        <td className="px-6 py-5 text-gray-600">{formatHours(row.breakHours)}</td>
        <td className="px-6 py-5 text-gray-600">{formatWorked(row.hours, row.breakHours)}</td>
        <td className="px-4 py-5">
          <div className="flex items-center gap-2">
            <select
              value={displayStatus}
              onChange={(e) => handleStatusChange(row, e.target.value as "pending" | "approved")}
              className={`min-w-[88px] shrink-0 rounded-full border-0 px-2.5 py-1 text-xs font-medium outline-none ${
                displayStatus === "approved"
                  ? "bg-green-50 text-green-700"
                  : "bg-amber-50 text-amber-700"
              }`}
            >
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
            </select>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => displayStatus !== "approved" && setEditingRow(row)}
                disabled={displayStatus === "approved"}
                className="rounded-md p-1 text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-300 disabled:hover:bg-transparent"
                aria-label={displayStatus === "approved" ? "Set to Pending to edit" : "Edit timestamp"}
                title={displayStatus === "approved" ? "Set to Pending to edit" : undefined}
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setDeletingRow(row)}
                className="rounded-md p-1 text-gray-600 hover:bg-red-50 hover:text-red-600"
                aria-label="Delete session"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </td>
      </tr>
    );
  }

  function renderBody() {
    if (mode !== "week") return rows.map(renderRow);

    const rowsByDate = new Map<string, ApprovalRow[]>();
    rows.forEach((row) => {
      const list = rowsByDate.get(row.date) ?? [];
      list.push(row);
      rowsByDate.set(row.date, list);
    });

    return (weekDays ?? []).flatMap((day) => {
      const dayRows = rowsByDate.get(day) ?? [];
      if (dayRows.length === 0) {
        return (
          <tr key={day} className="border-b border-gray-200 bg-gray-50 last:border-0">
            <td colSpan={columnCount} className="px-6 py-3 text-xs text-gray-400">
              {formatDayLabel(day)} - No entries
            </td>
          </tr>
        );
      }
      return dayRows.map(renderRow);
    });
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="flex justify-end border-b border-gray-200 px-6 py-3">
        <button
          type="button"
          onClick={onAddTimestamp}
          className="inline-flex items-center gap-1 rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Timestamp
        </button>
      </div>
      {selectedKeys.size > 0 && (
        <div className="flex items-center justify-between border-b border-gray-200 bg-accent/5 px-6 py-2.5">
          <span className="text-sm font-medium text-gray-950">
            {selectedKeys.size} selected
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={approveAllSelected}
              disabled={bulkSubmitting}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {bulkSubmitting ? "Approving..." : "Approve All"}
            </button>
            <button
              type="button"
              onClick={cancelSelection}
              disabled={bulkSubmitting}
              className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-gray-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {loading ? (
        <p className="p-6 text-sm text-gray-600">Loading...</p>
      ) : rows.length === 0 ? (
        <p className="p-6 text-sm text-gray-600">
          No timesheets for this {mode === "week" ? "week" : "day"} yet. Use Add Timestamp above
          to create one.
        </p>
      ) : (
        <div className="w-full overflow-x-auto rounded-b-xl">
          <table className="w-full table-fixed text-left text-sm">
            <colgroup>
              {columnWidths.map((width, i) => (
                <col key={i} style={{ width }} />
              ))}
            </colgroup>
            <thead className="border-b border-gray-200 text-gray-600">
              <tr>
                <th className="px-6 py-3.5 font-medium">
                  <input
                    ref={headerCheckboxRef}
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    aria-label="Select all"
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <span className="sr-only">Select All</span>
                </th>
                {mode === "week" && <th className="px-6 py-3.5 font-medium">Date</th>}
                <th className="px-6 py-3.5 font-medium">Name</th>
                <th className="px-6 py-3.5 font-medium">Company</th>
                <th className="px-6 py-3.5 font-medium">Site</th>
                <th className="px-6 py-3.5 font-medium">Job</th>
                <th className="px-6 py-3.5 font-medium">Time</th>
                <th className="px-6 py-3.5 font-medium">Shift</th>
                <th className="px-6 py-3.5 font-medium">Break</th>
                <th className="px-6 py-3.5 font-medium">Worked</th>
                <th className="px-4 py-3.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>{renderBody()}</tbody>
          </table>
        </div>
      )}

      {editingRow && (
        <ClockEventDetailModal
          event={editingRow.clockInEvent}
          allEvents={editEvents}
          onClose={() => setEditingRow(null)}
        />
      )}

      {viewingWarningsRow && (
        <SessionWarningsModal
          employeeName={viewingWarningsRow.employeeName}
          siteName={viewingWarningsRow.siteName}
          warnings={viewingWarningsRow.warnings}
          sites={sites}
          onAssignSite={(siteId) =>
            onAssignSite(viewingWarningsRow.key, viewingWarningsRow.sessionEventIds, siteId)
          }
          onClose={() => setViewingWarningsRow(null)}
        />
      )}

      {deletingRow && (
        <ConfirmDeleteSessionModal
          employeeName={deletingRow.employeeName}
          dateLabel={new Date(`${deletingRow.date}T00:00:00`).toLocaleDateString(undefined, {
            month: "long",
            day: "numeric",
            year: "numeric",
          })}
          onClose={() => setDeletingRow(null)}
          onConfirm={() => onDeleteSession(deletingRow.eventId, deletingRow.sessionEventIds)}
        />
      )}
    </div>
  );
}
