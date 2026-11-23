"use client";

import { useState } from "react";
import type { ClockEvent, ShiftNote, SiteExit } from "@/lib/types";
import { commentTimeMs } from "@/lib/shiftComments";
import { eventComment, commentEventLabel, formatCommentTime } from "@/lib/clockEventComments";
import { SiteExitsNote } from "@/components/time/SiteExitsNote";

// Employee App Phase 5 - the comments an employee left on this shift in
// the app, shown on the shift's clock-in (lib/shiftComments.ts picks
// them). Each one: a small "Comment" pill, the text, and when it was typed
// (an offline comment reaches the server later). Renders nothing when the
// shift has no comments.
export function ShiftCommentsNote({ comments }: { comments: ShiftNote[] }) {
  if (comments.length === 0) return null;

  return (
    <ul className="space-y-1" title="Left by the employee in the app. The time is when they typed it.">
      {comments.map((c) => {
        const ms = commentTimeMs(c);
        return (
          <li key={c.id} className="text-xs text-gray-600">
            <span className="mr-1.5 inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
              Comment
            </span>
            <span className="whitespace-pre-line">{c.note}</span>
            {ms !== null && (
              <span className="ml-1.5 text-gray-400">
                {new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// A table's Note cell: the event's own note, then the employee's
// camera-screen comment on THIS punch (ClockEvent.employeeComment, behind a
// "View comment" toggle), then its shift's comments and (Phase 8) "Left the
// job site" lines (clock-in rows only); "-" when there is none of them. The
// toggle stops the click so it never also opens the row's detail window.
export function EventNoteCell({ event, comments, exits = [] }: { event: ClockEvent; comments: ShiftNote[]; exits?: SiteExit[] }) {
  const [open, setOpen] = useState(false);
  const punchComment = eventComment(event);
  if (!event.note && !punchComment && comments.length === 0 && exits.length === 0) return <>-</>;

  return (
    <>
      {event.note && <p>{event.note}</p>}
      {punchComment && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpen((v) => !v);
            }}
            className="text-xs font-medium text-accent hover:underline"
            aria-expanded={open}
          >
            {open ? "Hide comment" : "View comment"}
          </button>
          {open && (
            <p className="mt-1 max-w-xs whitespace-pre-line text-xs text-gray-700">
              <span className="font-medium">{commentEventLabel(punchComment.eventType)} comment</span>
              {punchComment.timeMs !== null && <span className="text-gray-400"> - {formatCommentTime(punchComment.timeMs)}</span>}
              <br />
              {punchComment.text}
            </p>
          )}
        </>
      )}
      <ShiftCommentsNote comments={comments} />
      <SiteExitsNote exits={exits} />
    </>
  );
}
