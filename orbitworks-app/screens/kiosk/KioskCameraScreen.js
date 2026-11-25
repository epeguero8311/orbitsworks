import { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "../../lib/ThemeContext";
import { useKiosk } from "../../lib/hooks/useKiosk";
import { useKioskIdle } from "../../lib/hooks/useKioskIdle";
import { startPunchFix } from "../../lib/punchLocation";
import PunchCamera from "../../components/employee/PunchCamera";

// Task 5 Kiosk mode - the clock in/out photo (same camera as the Employee
// App: front camera, Retake / Use photo). The photo goes with the punch; the
// Pro face check runs on the server like every other punch. Saved first,
// sent right after (never blocked by signal). Back to Home after 60 s idle.
export default function KioskCameraScreen({ navigation, route }) {
  const { colors } = useTheme();
  const kiosk = useKiosk();
  const { employeeId, pin, action } = route.params;
  const employee = kiosk.table?.employees.find((e) => e.id === employeeId) || null;
  const [error, setError] = useState("");
  const saving = useRef(false);
  const fix = useRef(null);
  const touch = useKioskIdle(navigation, 60000);

  useEffect(() => {
    fix.current = startPunchFix();
  }, []);

  async function onUse(uri) {
    touch();
    if (saving.current || !employee) return;
    saving.current = true;
    try {
      const location = fix.current ? fix.current.take(Date.now()) : null;
      const { atMs } = await kiosk.recordPunch({ employee, action, pin, photoUri: uri, location });
      navigation.replace("KioskDone", { name: employee.name, action, atMs });
    } catch {
      saving.current = false;
      setError("Couldn't save that punch. Try again.");
    }
  }

  return (
    <View style={styles.flex} onTouchStart={touch}>
      <PunchCamera onUse={onUse} onCancel={() => navigation.popToTop()} />
      {error ? (
        <View style={[styles.errorBar, { backgroundColor: colors.redStrong }]}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#000" },
  errorBar: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 16 },
  errorText: { color: "#fff", fontSize: 16, fontWeight: "600", textAlign: "center" },
});
