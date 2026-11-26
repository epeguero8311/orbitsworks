import { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../lib/ThemeContext";
import { useKiosk } from "../../lib/hooks/useKiosk";
import { useKioskIdle } from "../../lib/hooks/useKioskIdle";
import { useNow } from "../../lib/hooks/useNow";
import { startPunchFix } from "../../lib/punchLocation";
import { kioskBreakView } from "../../lib/kioskLogic";
import { KIOSK_IDLE_ACTION_MS } from "../../lib/kioskLayout";

// Task 5 Kiosk mode - the Break screen (cleanup 2026-11-26). Reached by
// PIN -> [Break]; opening it never starts a break.
//   Not on break: [Start break] [Back]. Start break saves the punch (no
//   photo; queued offline like every kiosk punch) and shows the timer.
//   On a break: the timer + [End break] [Back]. End break -> Home.
// Back, or 15 s with no touch, returns Home; a started break keeps running.

function mmss(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function KioskBreakScreen({ navigation, route }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const kiosk = useKiosk();
  const { employeeId, pin } = route.params;
  const employee = kiosk.table?.employees.find((e) => e.id === employeeId) || null;
  const [startedHereMs, setStartedHereMs] = useState(undefined);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const fix = useRef(null);
  const touch = useKioskIdle(navigation, KIOSK_IDLE_ACTION_MS, saving);
  const now = useNow(1000);

  useEffect(() => {
    fix.current = startPunchFix();
  }, []);

  const { status, sinceMs } = employee ? kiosk.statusOf(employee) : { status: "out", sinceMs: null };
  const view = kioskBreakView(status, sinceMs, startedHereMs);

  async function save(action) {
    touch();
    if (saving || !employee) return;
    setSaving(true);
    setError("");
    try {
      const location = fix.current ? fix.current.take(Date.now()) : null;
      const { atMs } = await kiosk.recordPunch({ employee, action, pin, location });
      if (action === "breakEnd") {
        navigation.popToTop();
        return;
      }
      setStartedHereMs(atMs);
      setSaving(false);
    } catch {
      setSaving(false);
      setError("Couldn't save that. Try again.");
    }
  }

  const back = (
    <TouchableOpacity onPress={() => navigation.popToTop()} style={[styles.button, styles.outline, { borderColor: colors.border }]} accessibilityLabel="Back">
      <Text style={[styles.buttonText, { color: colors.text }]}>Back</Text>
    </TouchableOpacity>
  );

  let body;
  if (view.mode === "onBreak") {
    body = (
      <>
        <Text style={[styles.label, { color: colors.subtext }]}>On a break</Text>
        <Text style={[styles.timer, { color: colors.text }]}>{view.sinceMs ? mmss(now - view.sinceMs) : "--:--"}</Text>
        <View style={styles.row}>
          <TouchableOpacity onPress={() => save("breakEnd")} disabled={saving} style={[styles.button, { backgroundColor: colors.orange }]} accessibilityLabel="End break">
            <Text style={[styles.buttonText, { color: colors.onColor }]}>End break</Text>
          </TouchableOpacity>
          {back}
        </View>
      </>
    );
  } else if (view.mode === "start") {
    body = (
      <>
        <Text style={[styles.label, { color: colors.subtext }]}>Clocked in</Text>
        <View style={[styles.row, styles.rowGap]}>
          <TouchableOpacity onPress={() => save("breakStart")} disabled={saving} style={[styles.button, { backgroundColor: colors.orange }]} accessibilityLabel="Start break">
            <Text style={[styles.buttonText, { color: colors.onColor }]}>Start break</Text>
          </TouchableOpacity>
          {back}
        </View>
      </>
    );
  } else {
    body = (
      <>
        <Text style={[styles.blocked, { color: colors.redStrong }]}>Please clock in first.</Text>
        <View style={[styles.row, styles.rowGap]}>{back}</View>
      </>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 40 }]} onTouchStart={touch}>
      <Text style={[styles.name, { color: colors.text }]}>{employee?.name || "Employee"}</Text>
      {body}
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
  rowGap: { marginTop: 40 },
  button: { width: 200, height: 72, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  outline: { borderWidth: 1 },
  buttonText: { fontSize: 20, fontWeight: "700" },
  blocked: { fontSize: 20, fontWeight: "700", marginTop: 24 },
  error: { marginTop: 20, fontSize: 16, fontWeight: "600" },
});
