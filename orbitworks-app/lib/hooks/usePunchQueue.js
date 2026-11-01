import { useCallback, useEffect, useState } from "react";
import { getLastSynced, listAllPunches } from "../punchQueue";
import { subscribePunchQueue } from "../punchQueueEvents";
import { badgeCount, isPaused, nextBadgeChangeMs, visibleItems } from "../punchQueueLogic";

const EMPTY = { all: [], rows: [], badge: 0, open: 0, nextChangeMs: null, paused: false, lastSyncedMs: null, loaded: false };

// Employee App Phase 4: this employee's punches kept on the phone, re-read
// whenever the queue changes.
//   all          - every saved punch (for Home's status)
//   rows         - the Sync tab list, newest first (Synced stay 24 h)
//   badge        - Failed, plus Waiting + Syncing once 10 s old (Sync tab
//                  badge - a punch that syncs in a second never shows)
//   queueAhead   - punches are still waiting on the phone
//   paused       - the oldest unsent punch failed for good
//   lastSyncedMs - when the server last accepted a punch from this phone
export function usePunchQueue(companyId, employeeId) {
  const [state, setState] = useState(EMPTY);

  const load = useCallback(async () => {
    if (!companyId || !employeeId) return;
    try {
      const items = await listAllPunches();
      const lastSyncedMs = await getLastSynced(companyId, employeeId);
      const all = items.filter((i) => i.companyId === companyId && i.employeeId === employeeId);
      const nowMs = Date.now();
      setState({
        all,
        rows: visibleItems(items, companyId, employeeId, nowMs),
        badge: badgeCount(items, companyId, employeeId, nowMs),
        open: badgeCount(items, companyId, employeeId),
        nextChangeMs: nextBadgeChangeMs(items, companyId, employeeId, nowMs),
        paused: isPaused(items, companyId, employeeId),
        lastSyncedMs,
        loaded: true,
      });
    } catch {
      setState((prev) => ({ ...prev, loaded: true }));
    }
  }, [companyId, employeeId]);

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

  // Re-read when a fresh punch turns 10 s old, so the badge appears then.
  useEffect(() => {
    if (!state.nextChangeMs) return undefined;
    const timer = setTimeout(load, Math.max(0, state.nextChangeMs - Date.now()) + 50);
    return () => clearTimeout(timer);
  }, [state.nextChangeMs, load]);

  return { ...state, queueAhead: state.open > 0, reload: load };
}
