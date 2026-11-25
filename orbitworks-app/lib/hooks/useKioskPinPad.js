import { useCallback, useEffect, useRef, useState } from "react";
import { kioskLockSecondsLeft, recordKioskRightPin, recordKioskWrongPin } from "../kioskLock";

// Task 5 Kiosk mode: the 4-digit pad shared by Home (employee PIN) and the
// Kiosk Settings pad (admin PIN / exit key). Wrong answers count toward the
// tablet-wide 45 s wait (K14, lib/kioskLock.js), shown as a countdown.
// onFull(pin) -> true (right) | false (wrong) | null (neither - e.g. no
// connection to check a key; doesn't count as wrong).
export function useKioskPinPad(onFull) {
  const [pin, setPin] = useState("");
  const [checking, setChecking] = useState(false);
  const [lockLeft, setLockLeft] = useState(0);
  const busy = useRef(false);

  // The saved wait (a restart mid-wait keeps counting down).
  useEffect(() => {
    let live = true;
    kioskLockSecondsLeft().then((s) => live && setLockLeft(s));
    return () => {
      live = false;
    };
  }, []);

  const locked = lockLeft > 0;
  useEffect(() => {
    if (!locked) return;
    const t = setInterval(() => kioskLockSecondsLeft().then(setLockLeft), 500);
    return () => clearInterval(t);
  }, [locked]);

  const onDigit = useCallback(
    async (d) => {
      if (busy.current || lockLeft > 0) return;
      const next = (pin + d).slice(0, 4);
      setPin(next);
      if (next.length < 4) return;
      busy.current = true;
      setChecking(true);
      try {
        const ok = await onFull(next);
        if (ok === true) await recordKioskRightPin();
        else if (ok === false) setLockLeft(await recordKioskWrongPin());
      } finally {
        setPin("");
        setChecking(false);
        busy.current = false;
      }
    },
    [pin, lockLeft, onFull]
  );

  const onDelete = useCallback(() => {
    if (!busy.current) setPin((p) => p.slice(0, -1));
  }, []);

  return { pin, checking, lockLeft, onDigit, onDelete, locked };
}
