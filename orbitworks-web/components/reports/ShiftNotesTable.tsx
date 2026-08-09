"use client";

import type { ShiftNote } from "@/lib/types";

export default function ShiftNotesTable({ notes }: { notes: ShiftNote[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-6 py-4">
        <h2 className="text-base font-semibold text-gray-950">Shift Notes</h2>
        <p className="mt-1 text-sm text-gray-600">
          Notes left by supervisors during this date range.
        </p>
      </div>

      {notes.length === 0 ? (
        <p className="p-6 text-sm text-gray-600">
          No shift notes for this date range.
        </p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 text-gray-600">
            <tr>
              <th className="px-6 py-3 font-medium">Date</th>
              <th className="px-6 py-3 font-medium">Site</th>
              <th className="px-6 py-3 font-medium">Note</th>
              <th className="px-6 py-3 font-medium">Written By</th>
            </tr>
          </thead>
          <tbody>
            {notes.map((n) => (
              <tr key={n.id} className="border-b border-gray-200 last:border-0">
                <td className="px-6 py-3 text-gray-600">
                  {n.timestamp ? n.timestamp.toDate().toLocaleString() : "-"}
                </td>
                <td className="px-6 py-3 text-gray-600">{n.siteName}</td>
                <td className="px-6 py-3 text-gray-950">{n.note}</td>
                <td className="px-6 py-3 text-gray-600">{n.createdByName}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
