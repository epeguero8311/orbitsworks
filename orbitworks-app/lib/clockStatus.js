// Single source of truth for mapping a clock event type to a display status.
// Shared by clockLogic (writes) and useTodayShift (reads) so they can never
// drift out of sync as new event types get added.
export const STATUS_BY_EVENT_TYPE = {
  in: "in",
  breakStart: "break",
  breakEnd: "in",
  out: "out",
};

export function deriveStatus(eventType) {
  return STATUS_BY_EVENT_TYPE[eventType] ?? "out";
}