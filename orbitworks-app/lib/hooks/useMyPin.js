import { useCallback, useEffect, useRef, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";
import { PIN_SHOW_MS, pinStateFromResult } from "../employeeSettings";
import { useIsOffline } from "./useIsOffline";

const getMyPinFn = httpsCallable(functions, "getMyPin", { timeout: 15000 });

// Employee App Phase 10 (A1, D1 a): "Show PIN" on the Settings tab. Tap
// Show -> getMyPin (orbitworks-web/functions/src/employeeClock.ts) returns
// the employee's own current PIN; it stays on screen PIN_SHOW_MS, then hides.
// Online only. The PIN lives in this hook's memory only - never saved on
// the phone, never logged. hide() runs when the screen loses focus too.
// -> { state, show, hide }   state = { status, pin? } (see pinRowText)
export function useMyPin() {
  const [state, setState] = useState({ status: "hidden" });
  const isOffline = useIsOffline();
  const timer = useRef(null);
  const run = useRef(0);

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const hide = useCallback(() => {
    run.current += 1;
    clearTimer();
    setState({ status: "hidden" });
  }, []);

  const show = useCallback(async () => {
    clearTimer();
    if (isOffline) {
      setState({ status: "offline" });
      return;
    }
    const mine = ++run.current;
    setState({ status: "loading" });
    let next;
    try {
      const res = await getMyPinFn({});
      next = pinStateFromResult(res.data);
    } catch (err) {
      next = pinStateFromResult(null, err);
    }
    if (mine !== run.current) return;
    setState(next);
    if (next.status === "shown") timer.current = setTimeout(hide, PIN_SHOW_MS);
  }, [isOffline, hide]);

  useEffect(() => () => {
    run.current += 1;
    clearTimer();
  }, []);

  return { state, show, hide };
}
