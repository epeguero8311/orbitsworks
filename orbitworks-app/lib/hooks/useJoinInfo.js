import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJoinInfo } from "../joinApi";

// Loads what a crew code shows (company, subcontractors, consent text) as
// soon as there is a token. phase:
//   "loading"  first load or Retry in progress
//   "active"   info is ready
//   "inactive" the code is no longer active (dead end)
//   "error"    network / server problem - show Retry, not the dead end
// reload() fetches again and resolves the fresh result (or null on error),
// used after a consent version change.
export function useJoinInfo(token) {
  const [phase, setPhase] = useState("loading");
  const [info, setInfo] = useState(null);
  const latest = useRef(0);

  const load = useCallback(async () => {
    if (!token) return null;
    const run = ++latest.current;
    setPhase("loading");
    try {
      const result = await fetchJoinInfo(token);
      if (run !== latest.current) return null;
      if (result.status === "inactive") {
        setInfo(null);
        setPhase("inactive");
      } else {
        setInfo(result);
        setPhase("active");
      }
      return result;
    } catch {
      if (run !== latest.current) return null;
      setPhase("error");
      return null;
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const markInactive = useCallback(() => {
    latest.current++;
    setInfo(null);
    setPhase("inactive");
  }, []);

  return { phase, info, reload: load, markInactive };
}
