"use client";

import { useEffect, useRef, useState } from "react";
import { Pencil, Trash2, Plus, ShieldAlert } from "lucide-react";
import type { ApprovalRow } from "@/lib/hooks/useTimesheetApprovals";
import type { ClockEvent } from "@/lib/types";
import ClockEventDetailModal from "@/components/dashboard/ClockEventDetailModal";
import ConfirmDeleteSessionModal from "@/components/dashboard/timesheetApprovals/ConfirmDeleteSessionModal";
import OverrideDetailsModal from "@/components/dashboard/timesheetApprovals/OverrideDetailsModal";

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

// Percentage widths for <colgroup>, in table order, so the table always
// fills its container (table-fixed) instead of auto-sizing wider than the
// card and getting clipped by the card's overflow-hidden. Two variants
// because Week mode inserts a Date column.
const DAY_COLUMN_WIDTHS = ["9%", "13%", "12%", "12%", "12%", "8%", "8%", "8%", "12%", "6%"];
const WEEK_COLUMN_WIDTHS = ["9%", "8%", "12%", "11%", "11%", "12%", "7%", "7%", "7%", "11%", "5%"];

export function ApprovalsTable({
  rows,
  loading,
  mode,
  weekDays,
  onSetStatus,
  onSetStatusBulk,
  onDeleteSession,
  onAddTimestamp,
}: {
  rows: ApprovalRow[];
  loading: boolean;
  mode: "day" | "week";
  weekDays?: string[];
  onSetStatus: (eventId: string, status: "pending" | "approved") => Promise<void>;
  onSetStatusBulk: (eventIds: string[], status: "pending" | "approved") => Promise<void>;
  onDeleteSession: (approvalId: string, eventIds: string[]) => Promise<void>;
  onAddTimestamp: () => void;
}) {
  const [editingRow, setEditingRow] = useState<ApprovalRow | null>(null);
  const [deletingRow, setDeletingRow] = useState<ApprovalRow | null>(null);
  const [viewingOverrideEventId, setViewingOverrideEventId] = useState<string | null>(null);
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

  async function approveAllSelected() {
    const keys = Array.from(selectedKeys);
    if (keys.length === 0) return;
    setBulkSubmitting(true);
    setOptimisticStatus((prev) => {
      const next = new Map(prev);
      keys.forEach((key) => next.set(key, "approved"));
      return next;
    });
    try {
      await onSetStatusBulk(keys, "approved");
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
      await onSetStatus(row.eventId, status);
    } catch (err) {
      console.error("Failed to update approval status:", err);
      setOptimisticStatus((prev) => {
        const next = new Map(prev);
        next.delete(row.key);
        return next;
      });
    }
  }

  const editEvents: ClockEvent[] = editingRow
    ? [editingRow.clockInEvent, editingRow.clockOutEvent]
    : [];

  const columnCount = mode === "week" ? 11 : 10;
  const columnWidths = mode === "week" ? WEEK_COLUMN_WIDTHS : DAY_COLUMN_WIDTHS;

  function renderRow(row: ApprovalRow) {
    const overrideFlag = row.flags.find((f) => f.type === "SUPERVISOR_OVERRIDE");
    const displayStatus = optimisticStatus.get(row.key) ?? row.status;
    const highlightOverride = !!overrideFlag && displayStatus === "pending";
    return (
      <tr
        key={row.key}
        className={`border-b border-gray-200 last:border-0 ${
          highlightOverride ? "bg-amber-50" : "bg-white"
        }`}
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
            {overrideFlag && (
              <button
                type="button"
                onClick={() => setViewingOverrideEventId(overrideFlag.overrideEventId)}
                className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700 hover:bg-amber-200"
                title="View supervisor override details"
              >
                <ShieldAlert className="h-3 w-3" />
                Override
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
        <td className="px-6 py-5 font-mono text-xs text-gray-600">
          {formatTime(row.clockInEvent)} - {formatTime(row.clockOutEvent)}
        </td>
        <td className="px-6 py-5 text-gray-600">{formatHours(row.hours)}</td>
        <td className="px-6 py-5 text-gray-600">{formatHours(row.breakHours)}</td>
        <td className="px-6 py-5 text-gray-600">{formatWorked(row.hours, row.breakHours)}</td>
        <td className="px-6 py-5">
          <select
            value={displayStatus}
            onChange={(e) => handleStatusChange(row, e.target.value as "pending" | "approved")}
            className={`w-full max-w-[140px] rounded-full border-0 px-3 py-1.5 text-xs font-medium outline-none ${
              displayStatus === "approved"
                ? "bg-green-50 text-green-700"
                : "bg-amber-50 text-amber-700"
            }`}
          >
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
          </select>
        </td>
        <td className="px-6 py-5 text-right">
          <div className="flex justify-end gap-2">
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
        <div className="overflow-x-auto rounded-b-xl">
          <table className="w-full min-w-[1040px] table-fixed text-left text-sm">
            <colgroup>
              {columnWidths.map((width, i) => (
                <col key={i} style={{ width }} />
              ))}
            </colgroup>
            <thead className="border-b border-gray-200 text-gray-600">
              <tr>
                <th className="px-6 py-3.5 font-medium">
                  <span className="flex items-center gap-2 whitespace-nowrap">
                    <input
                      ref={headerCheckboxRef}
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      aria-label="Select all"
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <span className="text-xs font-normal text-gray-500">Select All</span>
                  </span>
                </th>
                {mode === "week" && <th className="px-6 py-3.5 font-medium">Date</th>}
                <th className="px-6 py-3.5 font-medium">Name</th>
                <th className="px-6 py-3.5 font-medium">Company</th>
                <th className="px-6 py-3.5 font-medium">Site</th>
                <th className="px-6 py-3.5 font-medium">Time</th>
                <th className="px-6 py-3.5 font-medium">Shift</th>
                <th className="px-6 py-3.5 font-medium">Break</th>
                <th className="px-6 py-3.5 font-medium">Worked</th>
                <th className="px-6 py-3.5 font-medium">Status</th>
                <th className="px-6 py-3.5 font-medium"></th>
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

      {viewingOverrideEventId && (
        <OverrideDetailsModal
          overrideEventId={viewingOverrideEventId}
          onClose={() => setViewingOverrideEventId(null)}
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
