import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJoinInfo } from "../joinApi";

// Loads what a crew code or email invite (kind "qr" | "invite") shows
// (company, subcontractors, consent text) as soon as there is a token.
// phase:
//   "loading"  first load or Retry in progress
//   "active"   info is ready
//   "inactive" the link is no longer active (dead end)
//   "error"    network / server problem - show Retry, not the dead end
// reload() fetches again and resolves the fresh result (or null on error),
// used after a consent version change.
//
// The result is stored with the link it belongs to (key), so a new link
// shows "loading" straight away without a setState inside the effect.
// The key holds the token: memory only, never logged.
export function useJoinInfo(token, kind = "qr") {
  const key = token ? `${kind}:${token}` : null;
  const [state, setState] = useState({ key: null, phase: "loading", info: null });
  const latest = useRef(0);

  const fetchInto = useCallback(
    async (run) => {
      try {
        const result = await fetchJoinInfo(token, kind);
        if (run !== latest.current) return null;
        setState(result.status === "inactive" ? { key, phase: "inactive", info: null } : { key, phase: "active", info: result });
        return result;
      } catch {
        if (run !== latest.current) return null;
        setState({ key, phase: "error", info: null });
        return null;
      }
    },
    [token, kind, key]
  );

  useEffect(() => {
    if (!key) return;
    fetchInto(++latest.current);
  }, [key, fetchInto]);

  const reload = useCallback(async () => {
    if (!key) return null;
    const run = ++latest.current;
    setState({ key, phase: "loading", info: null });
    return fetchInto(run);
  }, [key, fetchInto]);

  const markInactive = useCallback(() => {
    latest.current++;
    setState({ key, phase: "inactive", info: null });
  }, [key]);

  const current = state.key === key;
  return { phase: current ? state.phase : "loading", info: current ? state.info : null, reload, markInactive };
}
