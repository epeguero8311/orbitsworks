import { useCallback, useEffect, useRef } from "react";

// Task 5 Kiosk mode: a shared iPad never stays on someone's screen. After
// `ms` with no touch, go back to Home (popToTop) - which ends that
// employee's session; anything already saved (a started break, a punch)
// stays. Returns touch() - call it on any tap or keystroke to restart the
// wait. paused = true stops the wait (camera / photo being sent / the
// Create account PIN modal) and a fresh full wait starts when it ends.
// ms = null turns it off (the same screen outside the kiosk).
export function useKioskIdle(navigation, ms, paused = false) {
  const timer = useRef(null);
  const stop = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const touch = useCallback(() => {
    stop();
    if (!ms || paused) return;
    timer.current = setTimeout(() => navigation.popToTop(), ms);
  }, [navigation, ms, paused, stop]);
  useEffect(() => {
    touch();
    return stop;
  }, [touch, stop]);
  return touch;
}
