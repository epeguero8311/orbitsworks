import { useEffect, useState } from "react";
import NetInfo from "@react-native-community/netinfo";

// True while the phone has no usable connection. isConnected covers "no
// network at all"; isInternetReachable catches "on wifi but no real
// uplink". A null isInternetReachable (still checking) counts as online,
// so nothing flashes "offline" on every cold start.
export function useIsOffline() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const sub = NetInfo.addEventListener((state) => {
      setOffline(state.isConnected === false || state.isInternetReachable === false);
    });
    return () => sub();
  }, []);

  return offline;
}
