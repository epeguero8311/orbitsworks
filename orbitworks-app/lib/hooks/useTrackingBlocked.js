import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { trackingBlocked } from "../siteTracking";
import { subscribePunchQueue } from "../punchQueueEvents";
import { subscribeTrackingKick } from "../siteTrackingEvents";

// Employee App Phase 8: true while this employee's shift is tracked for
// leaving the job site but can't be (no location consent or no Always
// location) - Home shows the "job site alerts are off" banner. Re-checked
// when the queue changes, the app comes to the front, or tracking is
// checked again. State set only in promise callbacks.
export function useTrackingBlocked(companyId, employeeId) {
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (!companyId || !employeeId) return undefined;
    let active = true;
    const run = () =>
      trackingBlocked(companyId, employeeId).then((b) => {
        if (active) setBlocked(b);
      });
    run();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") run();
    });
    const unsubQueue = subscribePunchQueue(run);
    const unsubKick = subscribeTrackingKick(() => setTimeout(run, 1500));
    return () => {
      active = false;
      sub.remove();
      unsubQueue();
      unsubKick();
    };
  }, [companyId, employeeId]);

  return blocked;
}
