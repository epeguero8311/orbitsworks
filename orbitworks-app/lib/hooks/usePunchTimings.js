import { useEffect, useState } from "react";
import { readTimings, subscribeTimings, TIMINGS_ENABLED } from "../punchTimings";

// DEV BUILD ONLY: the last punch timings (lib/punchTimings.js), newest
// first. Always [] outside the dev build.
export function usePunchTimings() {
  const [timings, setTimings] = useState([]);

  useEffect(() => {
    if (!TIMINGS_ENABLED) return undefined;
    let alive = true;
    readTimings().then((list) => {
      if (alive) setTimings(list);
    });
    const unsubscribe = subscribeTimings((list) => setTimings(list));
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  return timings;
}
