import { useCallback, useEffect, useRef } from "react";

// Task 5 Kiosk mode: a shared iPad never stays on someone's screen. After
// `ms` with no touch, go back to Home (popToTop). Returns touch() - call it
// on any tap to restart the wait.
export function useKioskIdle(navigation, ms) {
  const timer = useRef(null);
  const touch = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => navigation.popToTop(), ms);
  }, [navigation, ms]);
  useEffect(() => {
    touch();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [touch]);
  return touch;
}
