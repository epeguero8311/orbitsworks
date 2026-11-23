import { useEffect, useState } from "react";

// Current time, re-read every intervalMs. Home ticks every second while a
// timer shows, and once a minute otherwise (so "today" and "Done for the
// day" still roll over at midnight).
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}
