import { useEffect, useState } from "react";
import NetInfo from "@react-native-community/netinfo";
import { isWeakSignal, subscribeSignal, weakSignalEndsAt } from "../punchQueueEvents";

const TEXT = {
  offline: "No signal. Punches are saved on this phone and sync when online.",
  weak: "Weak signal. Punches are saved on this phone and sync when online.",
};

// Employee App Phase 4: the thin banner on Home and the PIN screen.
// "offline" when the phone has no connection; "weak" for 2 minutes after
// a PIN check, punch or sync timed out even though the phone reports a
// connection. -> { visible, kind, text }
export function useConnectionBanner() {
  const [offline, setOffline] = useState(false);
  const [weak, setWeak] = useState(() => isWeakSignal());

  useEffect(() => {
    const unsubscribeNet = NetInfo.addEventListener((state) => {
      setOffline(state.isConnected === false || state.isInternetReachable === false);
    });
    let timer = null;
    const update = () => {
      const now = Date.now();
      setWeak(isWeakSignal(now));
      clearTimeout(timer);
      const endsAt = weakSignalEndsAt();
      if (endsAt > now) timer = setTimeout(update, endsAt - now + 50);
    };
    update();
    const unsubscribeSignal = subscribeSignal(update);
    return () => {
      unsubscribeNet();
      unsubscribeSignal();
      clearTimeout(timer);
    };
  }, []);

  const kind = offline ? "offline" : weak ? "weak" : null;
  return { visible: kind !== null, kind, text: kind ? TEXT[kind] : "" };
}
