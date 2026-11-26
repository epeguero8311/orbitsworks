import { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../lib/ThemeContext";
import { useKiosk } from "../../lib/hooks/useKiosk";
import { useKioskIdle } from "../../lib/hooks/useKioskIdle";
import { startPunchFix } from "../../lib/punchLocation";
import { KIOSK_IDLE_ACTION_MS } from "../../lib/kioskLayout";

// Task 5 Kiosk mode - right after Start break: the break timer with
// [End break] and [Back] (spec). Back (or 25 s with no touch) returns to
// Home with the break still running; ending it later is PIN -> End break.

function mmss(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function KioskBreakScreen({ navigation, route }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const kiosk = useKiosk();
  const { employeeId, pin, startedAtMs } = route.params;
  const employee = kiosk.table?.employees.find((e) => e.id === employeeId) || null;
  const [now, setNow] = useState(startedAtMs);
  const [error, setError] = useState("");
  const saving = useRef(false);
  const fix = useRef(null);
  const touch = useKioskIdle(navigation, KIOSK_IDLE_ACTION_MS);

  useEffect(() => {
    fix.current = startPunchFix();
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  async function endBreak() {
    touch();
    if (saving.current || !employee) return;
    saving.current = true;
    try {
      const location = fix.current ? fix.current.take(Date.now()) : null;
      const { atMs } = await kiosk.recordPunch({ employee, action: "breakEnd", pin, location });
      navigation.replace("KioskDone", { name: employee.name, action: "breakEnd", atMs });
    } catch {
      saving.current = false;
      setError("Couldn't save that. Try again.");
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 40 }]} onTouchStart={touch}>
      <Text style={[styles.name, { color: colors.text }]}>{employee?.name || "Employee"}</Text>
      <Text style={[styles.label, { color: colors.subtext }]}>On a break</Text>
      <Text style={[styles.timer, { color: colors.text }]}>{mmss(now - startedAtMs)}</Text>
      <View style={styles.row}>
        <TouchableOpacity onPress={endBreak} style={[styles.button, { backgroundColor: colors.orange }]}>
          <Text style={[styles.buttonText, { color: colors.onColor }]}>End break</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.popToTop()} style={[styles.button, styles.outline, { borderColor: colors.border }]}>
          <Text style={[styles.buttonText, { color: colors.text }]}>Back</Text>
        </TouchableOpacity>
      </View>
      {error ? <Text style={[styles.error, { color: colors.redStrong }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", paddingHorizontal: 24 },
  name: { fontSize: 28, fontWeight: "700", marginTop: 40 },
  label: { fontSize: 18, marginTop: 8 },
  timer: { fontSize: 72, fontWeight: "700", marginVertical: 32, fontVariant: ["tabular-nums"] },
  row: { flexDirection: "row", gap: 20 },
  button: { width: 200, height: 72, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  outline: { borderWidth: 1 },
  buttonText: { fontSize: 20, fontWeight: "700" },
  error: { marginTop: 20, fontSize: 16, fontWeight: "600" },
});
