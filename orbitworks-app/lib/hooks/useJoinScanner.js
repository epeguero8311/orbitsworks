import { useCallback, useRef, useState } from "react";
import { useCameraPermissions } from "expo-camera";
import { parseJoinUrl } from "../joinLink";
import { getJoinLinks, setPendingJoinToken } from "../pendingJoin";

const NOT_A_CODE = "That's not an OrbitsWorks crew code. Scan the QR code your admin gave you.";

// In-app QR scanner for "Join with crew code". Only accepts our own crew
// code links (lib/joinLink.js). onFound runs once per good scan.
export function useJoinScanner({ onFound }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [error, setError] = useState(null);
  const busy = useRef(false);

  const onBarcodeScanned = useCallback(
    ({ data }) => {
      if (busy.current) return;
      busy.current = true;
      const token = parseJoinUrl(data, getJoinLinks());
      if (token) {
        setError(null);
        setPendingJoinToken(token);
        onFound();
        return;
      }
      setError(NOT_A_CODE);
      // Let them try again after a moment instead of re-firing every frame.
      setTimeout(() => {
        busy.current = false;
      }, 1500);
    },
    [onFound]
  );

  return { permission, requestPermission, error, onBarcodeScanned };
}
