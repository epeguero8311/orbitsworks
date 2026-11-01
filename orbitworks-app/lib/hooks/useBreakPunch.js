import { useCallback, useState } from "react";
import { isOnline, newRequestId } from "../employeeClockApi";
import { queuedTimeFor } from "../punchQueueLogic";
import { enqueuePunch } from "../punchQueue";
import { isWeakSignal } from "../punchQueueEvents";
import { punchClockFields } from "../clockAnchor";
import { startPunchTimer } from "../punchTimings";

const SAVE_FAILED = "Couldn't save this punch on the phone. Try again.";

// Employee App breaks: one tap, a confirm, then the green confirmation at
// once. No PIN, no photo. Same as the supervisor app: the break is saved on
// the phone and the queue (punchQueueSync.js) sends it straight away when
// online; "Will sync when online" shows only when offline or on weak signal.
//   pending: "breakStart" | "breakEnd" | null (the confirm is showing)
// One requestId per confirmed tap. siteName: the shift's site, shown on the
// confirmation.
export function useBreakPunch({ companyId, employeeId, lastEventMs, siteName }) {
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

  // Resolves true once the break is saved (the green overlay then shows).
  // The confirm box stays up under the overlay until it is opaque
  // (overlayShown), so nothing changes behind the fade.
  const confirm = useCallback(async () => {
    if (!pending || !requestId || sending || result) return false;
    const action = pending;
    setSending(true);
    setError("");
    // Dev-build-only timing (lib/punchTimings.js): confirm tap -> green screen.
    const timer = startPunchTimer(action);
    timer.mark("sendStart");
    try {
      const queuedAtMs = queuedTimeFor(Date.now(), lastEventMs);
      const clock = await punchClockFields();
      const [, online] = await Promise.all([
        enqueuePunch({ companyId, employeeId, action, requestId, queuedAtMs, siteName: siteName || "", clock }),
        isOnline(),
      ]);
      timer.finish("saved");
      setResult({ type: action, timestampMs: queuedAtMs, siteName: siteName || "", queued: !online || isWeakSignal() });
      return true;
    } catch {
      timer.finish("saveFailed");
      setError(SAVE_FAILED);
      return false;
    } finally {
      setSending(false);
    }
  }, [pending, requestId, sending, result, lastEventMs, companyId, employeeId, siteName]);

  // The overlay is opaque: close the confirm box behind it.
  const overlayShown = useCallback(() => setPending(null), []);

  // Overlay closed (tap or 3 s) - also before it was fully shown.
  const clearResult = useCallback(() => {
    setResult(null);
    setPending(null);
  }, []);

  return { pending, sending, error, result, ask, cancel, confirm, clearResult, overlayShown };
}
