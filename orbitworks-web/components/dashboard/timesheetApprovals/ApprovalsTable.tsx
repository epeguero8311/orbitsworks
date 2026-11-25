"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { Pencil, Trash2, Plus, ShieldAlert, MessageSquare, Settings2 } from "lucide-react";
import type { ApprovalRow } from "@/lib/hooks/useTimesheetApprovals";
import type { ClockEvent, Job } from "@/lib/types";
import { useSites } from "@/lib/hooks/useSites";
import { worstSeverity } from "@/lib/sessionWarnings";
import ClockEventDetailModal from "@/components/dashboard/ClockEventDetailModal";
import ConfirmDeleteSessionModal from "@/components/dashboard/timesheetApprovals/ConfirmDeleteSessionModal";
import SessionReviewModal from "@/components/dashboard/timesheetApprovals/sessionReview/SessionReviewModal";
import { sessionStartMs } from "@/lib/sessionReview";
import {
  APPROVALS_COLUMNS,
  approvalsColumnCount,
  buildColumnWidths,
  type ApprovalsColumnKey,
} from "@/lib/approvalsColumns";
import { formatTipCents } from "@/lib/validators/shiftTip";
import { clockDeviceLabel, clockTypeLabel } from "@/lib/approvalsClockInfo";
import { clockOutSiteNote } from "@/lib/clockOutSite";

// Rounds to whole minutes first, so a value a hair under the hour
// (4.99999h from subtracting hours) shows "5h 0m", never "4h 60m".
function formatHours(hours: number | null) {
  if (hours == null) return "-";
  const totalMinutes = Math.round(hours * 60);
  return `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
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

// Columns (Task 2: picked per company in the Columns modal - only the
// visible ones arrive in `columns`) and their widths (no Shift column since
// Phase 10 W6) live in lib/approvalsColumns.ts - the table is always
// exactly 100% of its card,
// so it never needs a horizontal scrollbar on a desktop window. The
// overflow-x-auto wrapper stays only as a fallback for phone-width windows.
// Phase 10 (W6, D13 a): cells use tighter padding below 1280 px wide
// (laptops), the old roomy padding from xl up.

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
  columns,
  onOpenColumns,
  tipsEnabled,
  onSetTip,
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
  columns: ApprovalsColumnKey[];
  onOpenColumns: () => void;
  // Tips (Task 3): the Session review Tips field (the Tips column itself
  // comes through `columns`, already hidden while Tips is OFF).
  tipsEnabled: boolean;
  onSetTip: (eventId: string, amountCents: number) => Promise<void>;
}) {
  const { sites } = useSites();
  const [editingRow, setEditingRow] = useState<ApprovalRow | null>(null);
  const [deletingRow, setDeletingRow] = useState<ApprovalRow | null>(null);
  // Session review: tracked by key, so the modal always shows the live row
  // (an edit, reassign or approval re-renders it with the new values).
  const [reviewKey, setReviewKey] = useState<string | null>(null);
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

  // When new rows arrive, drop optimistic values the real data now matches
  // and selections of rows that are gone. Done while rendering (React's
  // "adjust state when a prop changes" pattern), not in an effect.
  const [prevRows, setPrevRows] = useState(rows);
  if (prevRows !== rows) {
    setPrevRows(rows);
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
  }

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

  const reviewRow = reviewKey ? rows.find((r) => r.key === reviewKey) ?? null : null;
  const reviewSiblings = reviewRow
    ? rows
        .filter((r) => r.employeeId === reviewRow.employeeId && r.date === reviewRow.date)
        .sort((a, b) => sessionStartMs(a.clockInEvent) - sessionStartMs(b.clockInEvent))
    : [];

  const editEvents: ClockEvent[] = editingRow
    ? [editingRow.clockInEvent, editingRow.clockOutEvent]
    : [];

  // checkbox + (Date in week mode) + the visible columns - the pencil/trash
  // actions live inside the Status cell, not a column of their own, so
  // there is no separate actions column here.
  const columnCount = approvalsColumnCount(mode, columns);
  const activeJobs = jobs.filter((j) => j.active);
  const columnWidths = buildColumnWidths(mode, columns);
  const columnDefs = columns
    .map((key) => APPROVALS_COLUMNS.find((c) => c.key === key))
    .filter((c): c is (typeof APPROVALS_COLUMNS)[number] => !!c);

  function renderCell(
    key: ApprovalsColumnKey,
    row: ApprovalRow,
    displayStatus: "pending" | "approved",
    worst: ReturnType<typeof worstSeverity>
  ) {
    switch (key) {
      case "name":
        return (
          <td className="px-3 py-4 xl:px-6 xl:py-5 font-medium text-gray-950">
            <span className="flex flex-wrap items-center gap-2">
              {row.employeeName}
              {row.isClockedInNow && (
                <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">
                  Clocked In
                </span>
              )}
              {/* Employee comments - shift comments (Phase 9 H6 a) and
                  camera-screen punch comments. An icon, not a warning; opens
                  the same window, which shows warnings and comments together. */}
              {row.comments.length + row.punchComments.length > 0 && (
                <button
                  type="button"
                  onClick={() => setReviewKey(row.key)}
                  className="inline-flex items-center justify-center rounded-full bg-blue-50 p-1 text-accent transition-transform hover:scale-110 hover:bg-blue-100"
                  title={`${row.comments.length + row.punchComments.length} employee comment${row.comments.length + row.punchComments.length === 1 ? "" : "s"}`}
                  aria-label="See employee comments"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                </button>
              )}
              {worst != null && (
                <button
                  type="button"
                  onClick={() => setReviewKey(row.key)}
                  className={`inline-flex items-center justify-center rounded-full p-1 transition-transform hover:scale-110 ${
                    worst === "red"
                      ? "bg-red-100 text-red-700 hover:bg-red-200"
                      : "bg-amber-100 text-amber-700 hover:bg-amber-200"
                  }`}
                  title="Review session"
                  aria-label="Review session and warnings"
                >
                  <ShieldAlert className="h-3.5 w-3.5" />
                </button>
              )}
            </span>
          </td>
        );
      case "company":
        return (
          <td className="px-3 py-4 xl:px-6 xl:py-5 text-gray-600">
            {row.isSubcontractor ? (
              <span className="inline-flex items-center rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-medium text-purple-700">
                {row.companyName}
              </span>
            ) : (
              row.companyName
            )}
          </td>
        );
      case "site":
        return (
          <td className="px-3 py-4 xl:px-6 xl:py-5 text-gray-600">
            {row.siteName}
            {/* Fix round 2 (B b): the hours count under the clock-in site;
                this says where the clock-out was detected. Info only. */}
            {!row.isClockedInNow && clockOutSiteNote(row.clockInEvent, row.clockOutEvent) && (
              <span className="mt-1 block text-xs text-gray-500">{clockOutSiteNote(row.clockInEvent, row.clockOutEvent)}</span>
            )}
          </td>
        );
      case "job":
        return (
          <td className="px-3 py-4 xl:px-6 xl:py-5">
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
        );
      case "time":
        return (
          <td className="px-3 py-4 xl:px-6 xl:py-5 font-mono text-xs text-gray-600">
            {formatTime(row.clockInEvent)} - {formatTime(row.clockOutEvent)}
          </td>
        );
      case "break":
        return (
          <td className="px-3 py-4 xl:px-6 xl:py-5 text-gray-600">{formatHours(row.breakHours)}</td>
        );
      case "worked":
        return (
          <td className="px-3 py-4 xl:px-6 xl:py-5 text-gray-600">{formatWorked(row.hours, row.breakHours)}</td>
        );
      case "tips":
        return (
          <td className="px-3 py-4 xl:px-6 xl:py-5 text-gray-600">{formatTipCents(row.tipCents)}</td>
        );
      case "status":
        return (
          <td className="px-3 py-4 xl:px-4 xl:py-5">
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
        );
      case "regularHours":
        return <td className="px-3 py-4 xl:px-6 xl:py-5 text-gray-600">{formatHours(row.regularHours)}</td>;
      case "overtimeHours":
        return <td className="px-3 py-4 xl:px-6 xl:py-5 text-gray-600">{formatHours(row.overtimeHours)}</td>;
      case "clockInType":
        return <td className="px-3 py-4 xl:px-6 xl:py-5 text-gray-600">{clockTypeLabel(row.clockInEvent)}</td>;
      case "clockOutType":
        return <td className="px-3 py-4 xl:px-6 xl:py-5 text-gray-600">{clockTypeLabel(row.clockOutEvent)}</td>;
      case "clockInDevice":
        return <td className="break-words px-3 py-4 xl:px-6 xl:py-5 text-gray-600">{clockDeviceLabel(row.clockInEvent)}</td>;
      case "clockOutDevice":
        return <td className="break-words px-3 py-4 xl:px-6 xl:py-5 text-gray-600">{clockDeviceLabel(row.clockOutEvent)}</td>;
    }
  }

  function renderRow(row: ApprovalRow) {
    const worst = worstSeverity(row.warnings);
    const displayStatus = optimisticStatus.get(row.key) ?? row.status;
    const highlightWarning = worst != null && displayStatus === "pending";
    const highlightClass = highlightWarning ? (worst === "red" ? "bg-red-50" : "bg-amber-50") : "bg-white";
    return (
      <tr
        key={row.key}
        onClick={(e) => {
          // The row opens Session review, except clicks on its own controls
          // (checkbox, Job/Status dropdowns, icons, pencil/trash).
          if ((e.target as HTMLElement).closest("input, select, button, a, label")) return;
          setReviewKey(row.key);
        }}
        className={`cursor-pointer border-b border-gray-200 last:border-0 ${highlightClass}`}
      >
        <td className="px-3 py-4 xl:px-6 xl:py-5">
          <input
            type="checkbox"
            checked={selectedKeys.has(row.key)}
            onChange={() => toggleRowSelected(row.key)}
            aria-label={`Select ${row.employeeName}`}
            className="h-4 w-4 rounded border-gray-300"
          />
        </td>
        {mode === "week" && (
          <td className="px-3 py-4 xl:px-6 xl:py-5 text-gray-600">{formatDayLabel(row.date)}</td>
        )}
        {columns.map((key) => (
          <Fragment key={key}>{renderCell(key, row, displayStatus, worst)}</Fragment>
        ))}
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
      <div className="flex justify-end gap-2 border-b border-gray-200 px-6 py-3">
        <button
          type="button"
          onClick={onOpenColumns}
          className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-gray-300"
        >
          <Settings2 className="h-3.5 w-3.5" />
          Columns
        </button>
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
                <th className="px-3 py-3 xl:px-6 xl:py-3.5 font-medium">
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
                {mode === "week" && <th className="px-3 py-3 xl:px-6 xl:py-3.5 font-medium">Date</th>}
                {columnDefs.map((c) => (
                  <th
                    key={c.key}
                    title={c.help}
                    className={`px-3 py-3 xl:py-3.5 font-medium ${c.key === "status" ? "xl:px-4" : "xl:px-6"}`}
                  >
                    {c.label}
                  </th>
                ))}
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

      {reviewRow && (
        <SessionReviewModal
          row={reviewRow}
          siblings={reviewSiblings}
          status={optimisticStatus.get(reviewRow.key) ?? reviewRow.status}
          sites={sites}
          onSelectRow={setReviewKey}
          onSetStatus={(status) => handleStatusChange(reviewRow, status)}
          onAssignSite={(siteId) => onAssignSite(reviewRow.key, reviewRow.sessionEventIds, siteId)}
          tipsEnabled={tipsEnabled}
          onSaveTip={(amountCents) => onSetTip(reviewRow.eventId, amountCents)}
          onClose={() => setReviewKey(null)}
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
