import { useCallback, useState } from "react";
import { isOnline, newRequestId, PUNCH_TIMEOUT_MS, sendPunch, withTimeout } from "../employeeClockApi";
import { clockErrorMessage } from "../employeeHome";
import { isSignalError, queuedTimeFor } from "../punchQueueLogic";
import { enqueuePunch, setLastSynced } from "../punchQueue";
import { noteSignalOk, noteWeakSignal } from "../punchQueueEvents";
import { outcomeOf, startPunchTimer } from "../punchTimings";

const SAVE_FAILED = "Couldn't save this punch on the phone. Try again.";

// Employee App breaks: one tap, a confirm, then send. No PIN, no photo.
//   pending: "breakStart" | "breakEnd" | null (the confirm is showing)
// One requestId per confirmed tap; "Try again" on the error reuses it so a
// lost reply can't write a second break event.
// Phase 4: with no signal, a reply slower than 5 s, or older punches still
// in the phone's queue (queueAhead), the break is saved on the phone and
// the confirmation shows right away (result.queued = true). siteName: the
// shift's site, shown on that confirmation.
export function useBreakPunch({ companyId, employeeId, queueAhead, lastEventMs, siteName }) {
  const [pending, setPending] = useState(null);
  const [requestId, setRequestId] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const ask = useCallback((action) => {
    setError("");
    setPending(action);
    setRequestId(newRequestId());
  }, []);

  const cancel = useCallback(() => {
    setPending(null);
    setError("");
  }, []);

  const save = useCallback(
    async (action, queuedAtMs) => {
      try {
        await enqueuePunch({ companyId, employeeId, action, requestId, queuedAtMs, siteName: siteName || "" });
        setPending(null);
        setResult({ type: action, timestampMs: queuedAtMs, siteName: siteName || "", queued: true });
      } catch {
        setError(SAVE_FAILED);
      }
    },
    [companyId, employeeId, requestId, siteName]
  );

  const confirm = useCallback(async () => {
    if (!pending || !requestId) return;
    setSending(true);
    setError("");
    // Dev-build-only timing (lib/punchTimings.js): confirm tap -> reply.
    const timer = startPunchTimer(pending);
    timer.mark("sendStart");
    const queuedAtMs = queuedTimeFor(Date.now(), lastEventMs);
    try {
      if (queueAhead || !(await isOnline())) {
        timer.finish("queued");
        await save(pending, queuedAtMs);
        return;
      }
      const res = await withTimeout(sendPunch({ action: pending, requestId }), PUNCH_TIMEOUT_MS);
      timer.mark("punched");
      timer.finish("ok");
      noteSignalOk();
      setLastSynced(companyId, employeeId, Date.now()).catch(() => {});
      setPending(null);
      setResult(res);
    } catch (err) {
      if (isSignalError(err)) {
        if (err.code === "timeout") noteWeakSignal();
        timer.finish("queued");
        await save(pending, queuedAtMs);
        return;
      }
      timer.finish(outcomeOf(err));
      setError(clockErrorMessage(err, await isOnline()));
    } finally {
      setSending(false);
    }
  }, [pending, requestId, queueAhead, lastEventMs, companyId, employeeId, save]);

  const clearResult = useCallback(() => setResult(null), []);

  return { pending, sending, error, result, ask, cancel, confirm, clearResult };
}
