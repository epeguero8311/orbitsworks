import { commentEventLabel, formatCommentTime, type EventComment } from "@/lib/clockEventComments";

// The employee's comments on a session (Timesheet Approvals window): one
// line per comment with which punch it belongs to (Clock in / Clock out)
// and when, then the text. Renders nothing when there are none.
export function EmployeeCommentsList({ comments }: { comments: EventComment[] }) {
  if (comments.length === 0) return null;

  return (
    <ul className="space-y-2">
      {comments.map((c) => (
        <li key={c.eventId} className="text-xs text-gray-600">
          <p>
            <span className="mr-1.5 inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
              {commentEventLabel(c.eventType)}
            </span>
            {c.timeMs !== null && <span className="text-gray-400">{formatCommentTime(c.timeMs)}</span>}
          </p>
          <p className="mt-1 whitespace-pre-line text-gray-950">{c.text}</p>
        </li>
      ))}
    </ul>
  );
}
