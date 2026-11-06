"use client";

import { useState } from "react";
import type { ClockEvent } from "@/lib/types";
import { eventComment, commentEventLabel, formatCommentTime } from "@/lib/clockEventComments";

// A clock event table's Note cell: the event's own admin/system note (as
// before), then a "View comment" toggle when the employee left a comment on
// THIS event from the camera screen. "-" only when there's neither. The
// toggle stops the click so it never also opens the row's detail window.
export function EventNoteCell({ event }: { event: ClockEvent }) {
  const [open, setOpen] = useState(false);
  const comment = eventComment(event);
  if (!event.note && !comment) return <>-</>;

  return (
    <>
      {event.note && <p>{event.note}</p>}
      {comment && (
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
              <span className="font-medium">{commentEventLabel(comment.eventType)} comment</span>
              {comment.timeMs !== null && <span className="text-gray-400"> · {formatCommentTime(comment.timeMs)}</span>}
              <br />
              {comment.text}
            </p>
          )}
        </>
      )}
    </>
  );
}
