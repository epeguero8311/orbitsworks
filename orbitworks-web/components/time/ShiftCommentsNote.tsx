import type { ClockEvent, ShiftNote } from "@/lib/types";
import { commentTimeMs } from "@/lib/shiftComments";

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

// A table's Note cell: the event's own note, then its shift's comments
// (clock-in rows only); "-" when there is neither.
export function EventNoteCell({ event, comments }: { event: ClockEvent; comments: ShiftNote[] }) {
  if (!event.note && comments.length === 0) return <>-</>;

  return (
    <>
      {event.note && <p>{event.note}</p>}
      <ShiftCommentsNote comments={comments} />
    </>
  );
}
