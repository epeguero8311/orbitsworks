import { useMemo } from "react";
import { dayKey } from "../employeeHome";
import { buildWeekHistory } from "../historyDays";
import { foldQueuedEvents } from "../punchQueueLogic";
import { useEmployeeAppConfig } from "./useEmployeeAppConfig";
import { useMyClockEvents } from "./useMyClockEvents";
import { useNow } from "./useNow";
import { usePunchQueue } from "./usePunchQueue";

// Employee App Phase 5: the History tab's data - this week, Monday to today
// in the company's time zone, from the employee's real clock events plus
// the punches still on the phone (same sources as Home: live, and the last
// copy saved on the phone when offline). See buildWeekHistory
// (lib/historyDays.js) for the day and tag rules.
//   days      - newest first: hours, In progress, Missing clock-out, tags,
//               and every punch and break (items)
//   timezone  - the company's, for any other date text on the screen
//   loaded    - the first answer (server or saved copy) is in
export function useMyHistoryWeek(companyId, employeeId) {
  const { timezone, breaks } = useEmployeeAppConfig(companyId);
  const now = useNow(60000);
  const events = useMyClockEvents(companyId, employeeId, timezone, dayKey(now, timezone));
  const queue = usePunchQueue(companyId, employeeId, timezone);

  const week = useMemo(() => {
    const folded = foldQueuedEvents(events.weekEvents, queue.all, companyId, employeeId, now);
    return buildWeekHistory(folded, now, timezone, breaks);
  }, [events.weekEvents, queue.all, companyId, employeeId, now, timezone, breaks]);

  return { days: week.days, timezone, loaded: events.loaded && queue.loaded };
}
