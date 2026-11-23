import { useEffect, useRef } from "react";
import { breakReminderPlan, reminderKey } from "../breakReminders";
import { syncBreakReminders } from "../breakReminderScheduler";

// Employee App Phase 7: keeps the phone's break reminders in step with
// Home's status. home = deriveHomeState(...) on events + the phone's queue,
// so a break started or ended offline counts at once, and a break ended
// elsewhere (website, auto clock-out) counts when Home sees it. Runs after
// render, never awaited by the break (the punch is already saved), and only
// when what should be scheduled changed.
export function useBreakReminders({ companyId, employeeId, home, breaks }) {
  const status = home ? home.status : null;
  const breakStartMs = home ? home.breakStartMs : null;
  const key = reminderKey({ status, breakStartMs, breaks });
  const lastKey = useRef(null);

  useEffect(() => {
    if (!companyId || !employeeId) return;
    const fullKey = `${companyId}:${employeeId}:${key}`;
    if (lastKey.current === fullKey) return;
    lastKey.current = fullKey;
    const plan = status === "break" ? breakReminderPlan({ breakStartMs, breaks, nowMs: Date.now() }) : [];
    syncBreakReminders({ companyId, employeeId, plan, breakStartMs }).catch(() => {});
  }, [companyId, employeeId, key, status, breakStartMs, breaks]);
}
