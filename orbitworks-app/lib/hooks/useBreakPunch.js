import { useCallback, useState } from "react";
import { isOnline, newRequestId, sendPunch } from "../employeeClockApi";
import { clockErrorMessage, NO_SIGNAL } from "../employeeHome";
import { outcomeOf, startPunchTimer } from "../punchTimings";

// Employee App breaks: one tap, a confirm, then send. No PIN, no photo.
//   pending: "breakStart" | "breakEnd" | null (the confirm is showing)
// One requestId per confirmed tap; "Try again" on the error reuses it so a
// lost reply can't write a second break event.
export function useBreakPunch() {
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

  const confirm = useCallback(async () => {
    if (!pending || !requestId) return;
    setSending(true);
    setError("");
    // Dev-build-only timing (lib/punchTimings.js): confirm tap -> reply.
    const timer = startPunchTimer(pending);
    timer.mark("sendStart");
    try {
      if (!(await isOnline())) {
        setError(NO_SIGNAL);
        return;
      }
      const res = await sendPunch({ action: pending, requestId });
      timer.mark("punched");
      timer.finish("ok");
      setPending(null);
      setResult(res);
    } catch (err) {
      timer.finish(outcomeOf(err));
      setError(clockErrorMessage(err, await isOnline()));
    } finally {
      setSending(false);
    }
  }, [pending, requestId]);

  const clearResult = useCallback(() => setResult(null), []);

  return { pending, sending, error, result, ask, cancel, confirm, clearResult };
}
