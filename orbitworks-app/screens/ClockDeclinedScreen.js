import { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { recordDeclinedClockIn } from "../lib/declinedClockIns";

// Geofencing (Pro) auto site detection - reached from ClockCameraScreen for
// any declined/failed clock-in (Block-mode geofence denial, a deactivated
// employee, etc.), not just geofencing. Mirrors ClockConfirmScreen's exact
// layout (same success confirmation the worker just saw) but red, and
// stays up longer (~5s vs ~2s) since there's more to read. Purely
// informational - no "Ask a Supervisor" button; a supervisor can still
// override from the Dashboard independently, and this attempt is reviewed
// later via the alert bell (see DeclinedAlertsScreen) instead.
export default function ClockDeclinedScreen({ route, navigation }) {
  const { employee, message } = route.params;

  useEffect(() => {
    recordDeclinedClockIn({
      employeeId: employee?.id ?? null,
      employeeName: employee?.name ?? "Unknown",
      reason: message,
    }).catch(() => {});

    const timer = setTimeout(() => {
      navigation.popToTop();
    }, 5000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.xCircle}>
        <Text style={styles.xMark}>✕</Text>
      </View>
      <Text style={styles.name}>{employee?.name}</Text>
      <Text style={styles.status}>Not Clocked In</Text>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  xCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#dc2626",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
  },
  xMark: { color: "#fff", fontSize: 48, fontWeight: "700" },
  name: { fontSize: 20, fontWeight: "700", color: "#111" },
  status: { fontSize: 16, color: "#666", marginTop: 6 },
  message: { fontSize: 14, color: "#666", marginTop: 12, textAlign: "center" },
});
