import { useCallback, useState } from "react";
import { unsentTitle, stillUnsentNote } from "../queueOwnerLogic";

// Logout fix (2026-11-21): Log out on both apps. Counts what this login
// still hasn't sent (read fresh from the phone). Nothing = log out at
// once. Otherwise the box (LogoutUnsentModal): "Send now" sends (capped at
// SEND_MAX_MS) and logs out when nothing is left, else says how many are
// still waiting; "Log out anyway" logs out and keeps them on the phone.
// Nothing is ever deleted here.
//   countNow(): Promise<{ punches, comments?, siteExits?, employees? }>
//   sendNow():  Promise (the app's own sync)
//   logOut():   the app's sign out
const SEND_MAX_MS = 30000;

function total(counts) {
  return Object.values(counts || {}).reduce((sum, n) => sum + (n > 0 ? n : 0), 0);
}

function capped(promise, ms) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(resolve, ms);
  });
  return Promise.race([Promise.resolve(promise).catch(() => {}), timeout]).finally(() => clearTimeout(timer));
}

export function useLogoutUnsent({ countNow, sendNow, logOut }) {
  const [counts, setCounts] = useState(null);
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState(null);

  const readCounts = useCallback(async () => {
    try {
      return await countNow();
    } catch {
      return null;
    }
  }, [countNow]);

  const start = useCallback(async () => {
    const now = await readCounts();
    if (!now || total(now) === 0) {
      logOut();
      return;
    }
    setNote(null);
    setCounts(now);
  }, [readCounts, logOut]);

  const send = useCallback(async () => {
    setSending(true);
    setNote(null);
    await capped(sendNow(), SEND_MAX_MS);
    const left = await readCounts();
    setSending(false);
    if (left && total(left) === 0) {
      setCounts(null);
      logOut();
      return;
    }
    if (left) setCounts(left);
    setNote(stillUnsentNote(left ? total(left) : 1));
  }, [sendNow, readCounts, logOut]);

  const logOutAnyway = useCallback(() => {
    setCounts(null);
    logOut();
  }, [logOut]);

  const cancel = useCallback(() => {
    setCounts(null);
    setNote(null);
  }, []);

  return {
    open: !!counts,
    title: counts ? unsentTitle(counts) : null,
    note,
    sending,
    start,
    send,
    logOutAnyway,
    cancel,
  };
}
