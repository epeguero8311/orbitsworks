import { useCallback, useEffect, useState } from "react";
import { listAllComments } from "../commentQueue";
import { subscribePunchQueue } from "../punchQueueEvents";
import { badgeCount, nextBadgeChangeMs } from "../punchQueueLogic";
import { visibleComments } from "../commentQueueLogic";

const EMPTY = { all: [], rows: [], badge: 0, nextChangeMs: null, loaded: false };

// Employee App Phase 5: this employee's shift comments kept on the phone
// (comment_queue), re-read whenever the queue changes - same pattern as
// usePunchQueue (comments use the same change events).
//   all    - every saved comment of this employee (Comments screen)
//   rows   - the Sync tab list (visibleComments: unsynced always, Synced
//            from today and the 2 days before in timeZone)
//   badge  - Not synced, plus Waiting / Syncing once 10 s old (added to
//            the punch badge on the Sync tab)
export function useCommentQueue(companyId, employeeId, timeZone) {
  const [state, setState] = useState(EMPTY);

  const load = useCallback(async () => {
    if (!companyId || !employeeId) return;
    try {
      const items = await listAllComments();
      const nowMs = Date.now();
      setState({
        all: items.filter((i) => i.companyId === companyId && i.employeeId === employeeId),
        rows: visibleComments(items, companyId, employeeId, nowMs, timeZone),
        badge: badgeCount(items, companyId, employeeId, nowMs),
        nextChangeMs: nextBadgeChangeMs(items, companyId, employeeId, nowMs),
        loaded: true,
      });
    } catch {
      setState((prev) => ({ ...prev, loaded: true }));
    }
  }, [companyId, employeeId, timeZone]);

  useEffect(() => {
    if (!companyId || !employeeId) return undefined;
    let active = true;
    const reload = () => {
      if (active) load();
    };
    reload();
    const unsubscribe = subscribePunchQueue(reload);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [companyId, employeeId, load]);

  // Re-read when a fresh comment turns 10 s old, so the badge appears then.
  useEffect(() => {
    if (!state.nextChangeMs) return undefined;
    const timer = setTimeout(load, Math.max(0, state.nextChangeMs - Date.now()) + 50);
    return () => clearTimeout(timer);
  }, [state.nextChangeMs, load]);

  return state;
}
