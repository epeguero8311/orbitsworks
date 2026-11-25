import { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../../lib/ThemeContext";
import { useKiosk } from "../../lib/hooks/useKiosk";
import { useKioskIdle } from "../../lib/hooks/useKioskIdle";
import { kioskActions } from "../../lib/kioskLogic";
import { startPunchFix } from "../../lib/punchLocation";

// Task 5 Kiosk mode - after a right PIN: who it is, where they stand, and
// two buttons. Clock in/out -> photo -> done. Start break -> timer screen.
// End break -> done. A break while clocked out is BLOCKED with "Please clock
// in first" (spec); clocking out while on a break says end the break first.
// Breaks never take a photo. Back to Home by itself after 30 s.

function timeText(ms) {
  return ms ? new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : "";
}

export default function KioskActionScreen({ navigation, route }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const kiosk = useKiosk();
  const { employeeId, pin } = route.params;
  const employee = kiosk.table?.employees.find((e) => e.id === employeeId) || null;
  const [blocked, setBlocked] = useState("");
  const [saving, setSaving] = useState(false);
  const fix = useRef(null);
  const touch = useKioskIdle(navigation, 30000);

  // Location for the punch (Pro job-site auto-detect happens on the server).
  useEffect(() => {
    fix.current = startPunchFix();
  }, []);

  if (!employee) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 40 }]}>
        <Text style={[styles.name, { color: colors.text }]}>PIN not recognized</Text>
        <TouchableOpacity onPress={() => navigation.popToTop()} style={[styles.back, { borderColor: colors.border }]}>
          <Text style={[styles.backText, { color: colors.text }]}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { status, sinceMs } = kiosk.statusOf(employee);
  const actions = kioskActions(status);
  const statusLine =
    status === "in" ? `Clocked in${sinceMs ? ` since ${timeText(sinceMs)}` : ""}` :
    status === "break" ? `On a break${sinceMs ? ` since ${timeText(sinceMs)}` : ""}` :
    "Clocked out";

  function onClock() {
    touch();
    if (actions.clockBlocked) return setBlocked(actions.clockBlocked);
    navigation.replace("KioskCamera", { employeeId, pin, action: actions.clock });
  }

  async function onBreak() {
    touch();
    if (actions.breakBlocked) return setBlocked(actions.breakBlocked);
    if (saving) return;
    setSaving(true);
    try {
      const location = fix.current ? fix.current.take(Date.now()) : null;
      const { atMs } = await kiosk.recordPunch({ employee, action: actions.breakAction, pin, location });
      if (actions.breakAction === "breakStart") {
        navigation.replace("KioskBreak", { employeeId, pin, startedAtMs: atMs });
      } else {
        navigation.replace("KioskDone", { name: employee.name, action: "breakEnd", atMs });
      }
    } catch {
      setBlocked("Couldn't save that. Try again.");
      setSaving(false);
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 24 }]} onTouchStart={touch}>
      <TouchableOpacity onPress={() => navigation.popToTop()} style={styles.topBack} accessibilityLabel="Back">
        <Feather name="chevron-left" size={28} color={colors.text} />
        <Text style={[styles.backText, { color: colors.text }]}>Back</Text>
      </TouchableOpacity>

      <View style={styles.center}>
        <Text style={[styles.name, { color: colors.text }]}>{employee.name || "Employee"}</Text>
        <Text style={[styles.status, { color: colors.subtext }]}>{statusLine}</Text>

        <View style={styles.buttons}>
          <TouchableOpacity
            onPress={onClock}
            style={[styles.big, { backgroundColor: actions.clock === "in" ? colors.greenStrong : colors.redStrong }, actions.clockBlocked && styles.dim]}
          >
            <Feather name={actions.clock === "in" ? "log-in" : "log-out"} size={30} color={colors.onColor} />
            <Text style={[styles.bigText, { color: colors.onColor }]}>{actions.clock === "in" ? "Clock in" : "Clock out"}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onBreak}
            disabled={saving}
            style={[styles.big, { backgroundColor: colors.orange }, actions.breakBlocked && styles.dim]}
          >
            <Feather name="coffee" size={30} color={colors.onColor} />
            <Text style={[styles.bigText, { color: colors.onColor }]}>{actions.breakAction === "breakStart" ? "Start break" : "End break"}</Text>
          </TouchableOpacity>
        </View>

        {blocked ? <Text style={[styles.blocked, { color: colors.redStrong }]}>{blocked}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 24 },
  topBack: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  name: { fontSize: 30, fontWeight: "700", textAlign: "center" },
  status: { fontSize: 17, marginBottom: 24 },
  buttons: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 20 },
  big: { width: 220, height: 150, borderRadius: 20, alignItems: "center", justifyContent: "center", gap: 10 },
  bigText: { fontSize: 22, fontWeight: "700" },
  dim: { opacity: 0.45 },
  blocked: { marginTop: 20, fontSize: 18, fontWeight: "700" },
  back: { marginTop: 24, alignSelf: "center", paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  backText: { fontSize: 17, fontWeight: "600" },
});
