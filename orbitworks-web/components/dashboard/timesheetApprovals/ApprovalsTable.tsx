"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import type { ApprovalRow } from "@/lib/hooks/useTimesheetApprovals";
import type { ClockEvent } from "@/lib/types";
import ClockEventDetailModal from "@/components/dashboard/ClockEventDetailModal";
import ConfirmDeleteSessionModal from "@/components/dashboard/timesheetApprovals/ConfirmDeleteSessionModal";

export function ApprovalsTable({
  rows,
  loading,
  onSetStatus,
  onDeleteSession,
}: {
  rows: ApprovalRow[];
  loading: boolean;
  onSetStatus: (eventId: string, status: "pending" | "approved") => Promise<void>;
  onDeleteSession: (approvalId: string, eventIds: string[]) => Promise<void>;
}) {
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [editingRow, setEditingRow] = useState<ApprovalRow | null>(null);
  const [deletingRow, setDeletingRow] = useState<ApprovalRow | null>(null);

  function formatHours(hours: number | null) {
    if (hours == null) return "-";
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}h ${m}m`;
  }

  function formatTime(event: ClockEvent) {
    const ts = event.adjustedTimestamp ?? event.timestamp;
    if (!ts) return "-";
    return ts.toDate().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }

  async function handleStatusChange(row: ApprovalRow, status: "pending" | "approved") {
    setSavingKey(row.key);
    try {
      await onSetStatus(row.eventId, status);
    } catch (err) {
      console.error("Failed to update approval status:", err);
    } finally {
      setSavingKey(null);
    }
  }

  const editEvents: ClockEvent[] = editingRow
    ? [editingRow.clockInEvent, editingRow.clockOutEvent]
    : [];

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      {loading ? (
        <p className="p-6 text-sm text-gray-600">Loading...</p>
      ) : rows.length === 0 ? (
        <p className="p-6 text-sm text-gray-600">
          No timesheets for this day yet. Use Add Timestamp above to create one.
        </p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 text-gray-600">
            <tr>
              <th className="px-6 py-3 font-medium">Name</th>
              <th className="px-6 py-3 font-medium">Company</th>
              <th className="px-6 py-3 font-medium">Site</th>
              <th className="px-6 py-3 font-medium">Time</th>
              <th className="px-6 py-3 font-medium">Hours</th>
              <th className="px-6 py-3 font-medium">Break</th>
              <th className="px-6 py-3 font-medium">Status</th>
              <th className="px-6 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-b border-gray-200 bg-white last:border-0">
                <td className="px-6 py-4 font-medium text-gray-950">
                  <span className="flex items-center gap-2">
                    {row.employeeName}
                    {row.isClockedInNow && (
                      <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">
                        Clocked In
                      </span>
                    )}
                  </span>
                </td>
                <td className="px-6 py-4 text-gray-600">
                  {row.isSubcontractor ? (
                    <span className="inline-flex items-center rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-medium text-purple-700">
                      {row.companyName}
                    </span>
                  ) : (
                    row.companyName
                  )}
                </td>
                <td className="px-6 py-4 text-gray-600">{row.siteName}</td>
                <td className="px-6 py-4 font-mono text-xs text-gray-600">
                  {formatTime(row.clockInEvent)} - {formatTime(row.clockOutEvent)}
                </td>
                <td className="px-6 py-4 text-gray-600">{formatHours(row.hours)}</td>
                <td className="px-6 py-4 text-gray-600">{formatHours(row.breakHours)}</td>
                <td className="px-6 py-4">
                  <select
                    value={row.status}
                    disabled={savingKey === row.key}
                    onChange={(e) =>
                      handleStatusChange(row, e.target.value as "pending" | "approved")
                    }
                    className={`rounded-full border-0 px-2.5 py-1 text-xs font-medium outline-none disabled:opacity-50 ${
                      row.status === "approved"
                        ? "bg-green-50 text-green-700"
                        : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    <option value="pending">Pending</option>
                    <option value="approved">Approved</option>
                  </select>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingRow(row)}
                      className="rounded-md p-1 text-gray-600 hover:bg-gray-100"
                      aria-label="Edit timestamp"
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
            ))}
          </tbody>
        </table>
      )}

      {editingRow && (
        <ClockEventDetailModal
          event={editingRow.clockInEvent}
          allEvents={editEvents}
          onClose={() => setEditingRow(null)}
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