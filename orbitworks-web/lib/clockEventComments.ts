import type { ClockEvent } from "@/lib/types";

// The employee's camera-screen comments (ClockEvent.employeeComment). Each
// comment belongs to exactly one clock event, so a session can have up to
// two: one on its clock-in, one on its clock-out. Pure, no Firebase - unit
// tested in test/clockEventComments.test.mjs.

export type EventComment = {
  eventId: string;
  eventType: "in" | "out";
  text: string;
  // When the punch happened (the event's original timestamp - the comment
  // was typed right before it). null if the event has no time yet.
  timeMs: number | null;
};

type CommentSource = Pick<ClockEvent, "id" | "type" | "employeeComment" | "timestamp">;

// The event's own comment, or null. Only clock-ins and clock-outs carry
// one; a blank or non-string value counts as none.
export function eventComment(event: CommentSource | null | undefined): EventComment | null {
  if (!event || (event.type !== "in" && event.type !== "out")) return null;
  const text = typeof event.employeeComment === "string" ? event.employeeComment.trim() : "";
  if (!text) return null;
  const ts = event.timestamp;
  return {
    eventId: event.id,
    eventType: event.type,
    text,
    timeMs: ts && typeof ts.toMillis === "function" ? ts.toMillis() : null,
  };
}

// A session's comments: clock-in first, then clock-out. Each event only
// ever contributes its own comment.
export function sessionComments(clockInEvent: CommentSource, clockOutEvent: CommentSource): EventComment[] {
  return [eventComment(clockInEvent), eventComment(clockOutEvent)].filter((c): c is EventComment => c !== null);
}

export function commentEventLabel(eventType: EventComment["eventType"]): string {
  return eventType === "in" ? "Clock in" : "Clock out";
}

export function formatCommentTime(timeMs: number | null): string {
  if (timeMs === null) return "";
  return new Date(timeMs).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
