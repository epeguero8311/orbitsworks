"use client";

import type { ClockEvent, ShiftNote } from "@/lib/types";
import type { EventComment } from "@/lib/clockEventComments";
import { EmployeeCommentsList } from "@/components/time/EmployeeCommentsList";
import { ShiftCommentsNote } from "@/components/time/ShiftCommentsNote";

// Read-only. Clock-event notes (admin/system text on the clock in/out),
// the employee's camera-screen comments, then the shift comment thread.
export function SessionComments({
  clockIn,
  clockOut,
  punchComments,
  comments,
}: {
  clockIn: ClockEvent;
  clockOut: ClockEvent;
  punchComments: EventComment[];
  comments: ShiftNote[];
}) {
  const notes = [
    { label: "Clock in", note: clockIn.note },
    { label: "Clock out", note: clockOut.note },
  ].filter((n): n is { label: string; note: string } => !!n.note);
  const empty = notes.length + punchComments.length + comments.length === 0;

  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-600">Comments</p>
      {empty ? (
        <p className="mt-3 text-sm text-gray-600">No comments</p>
      ) : (
        <div className="mt-3 space-y-2">
          {notes.map((n) => (
            <p key={n.label} className="text-xs text-gray-600">
              <span className="mr-1.5 inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                {n.label} note
              </span>
              <span className="whitespace-pre-line">{n.note}</span>
            </p>
          ))}
          <EmployeeCommentsList comments={punchComments} />
          <ShiftCommentsNote comments={comments} />
        </div>
      )}
    </div>
  );
}
