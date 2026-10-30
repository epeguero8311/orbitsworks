import { useCallback, useEffect, useState } from "react";
import { getLastSynced, listAllPunches } from "../punchQueue";
import { subscribePunchQueue } from "../punchQueueEvents";
import { badgeCount, isPaused, visibleItems } from "../punchQueueLogic";

const EMPTY = { all: [], rows: [], badge: 0, paused: false, lastSyncedMs: null, loaded: false };

// Employee App Phase 4: this employee's punches kept on the phone, re-read
// whenever the queue changes.
//   all          - every saved punch (for Home's status)
//   rows         - the Sync tab list, newest first (Synced stay 24 h)
//   badge        - Waiting + Syncing + Failed (Sync tab badge)
//   queueAhead   - a new punch must join the queue behind these
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
      setState({
        all,
        rows: visibleItems(items, companyId, employeeId, Date.now()),
        badge: badgeCount(items, companyId, employeeId),
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

  return { ...state, queueAhead: state.badge > 0, reload: load };
}
