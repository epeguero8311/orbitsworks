// Time Tracking day view (bug 11/26): turn loaded clock-event docs into
// ClockEvents without ONE bad doc blanking the page. A doc whose timestamp
// is missing or not a Timestamp (anything without toMillis) is skipped with a
// console.warn instead of throwing inside the render. Pure (duck-typed
// Timestamps), so it runs under plain Node tests.
import type { ClockEvent } from "@/lib/types";

type DocLikeInput = { id: string; data: () => unknown };
type TsLike = { toMillis: () => number };

export function isTimestampLike(v: unknown): v is TsLike {
  return !!v && typeof (v as { toMillis?: unknown }).toMillis === "function";
}

// Docs -> ClockEvents, newest first; bad docs skipped (+ console.warn).
export function toClockEvents(docs: DocLikeInput[], where = "clock events"): ClockEvent[] {
  const out: ClockEvent[] = [];
  for (const d of docs) {
    const data = d.data() as Record<string, unknown> | undefined;
    if (!data || !isTimestampLike(data.timestamp)) {
      console.warn(`[${where}] skipped clock event ${d.id}: timestamp is not a Timestamp`, data?.timestamp);
      continue;
    }
    if (data.adjustedTimestamp != null && !isTimestampLike(data.adjustedTimestamp)) {
      console.warn(`[${where}] clock event ${d.id}: ignored a bad adjustedTimestamp`, data.adjustedTimestamp);
      const { adjustedTimestamp: _bad, ...rest } = data;
      void _bad;
      out.push({ id: d.id, ...(rest as Omit<ClockEvent, "id">) });
      continue;
    }
    out.push({ id: d.id, ...(data as Omit<ClockEvent, "id">) });
  }
  return out.sort((a, b) => (b.timestamp?.toMillis() ?? 0) - (a.timestamp?.toMillis() ?? 0));
}

// The picked day's events (raw timestamp inside [startMs, endMs]).
export function eventsInDay(all: ClockEvent[], startMs: number, endMs: number): ClockEvent[] {
  return all.filter((e) => {
    const ms = isTimestampLike(e.timestamp) ? e.timestamp.toMillis() : null;
    return ms !== null && ms >= startMs && ms <= endMs;
  });
}
