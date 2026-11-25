import { useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTheme } from "../../lib/ThemeContext";

// Task 5 Kiosk mode - the confirmation after a punch. The punch is already
// saved on the iPad (and being sent); back to Home after 3 s or a tap.

const DONE_TEXT = {
  in: "Clocked in",
  out: "Clocked out",
  breakStart: "Break started",
  breakEnd: "Break ended",
};

export default function KioskDoneScreen({ navigation, route }) {
  const { colors } = useTheme();
  const { name, action, atMs } = route.params;

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    const t = setTimeout(() => navigation.popToTop(), 3000);
    return () => clearTimeout(t);
  }, [navigation]);

  return (
    <TouchableOpacity activeOpacity={1} onPress={() => navigation.popToTop()} style={[styles.container, { backgroundColor: colors.greenStrong }]}>
      <View style={styles.check}>
        <Feather name="check" size={64} color={colors.greenStrong} />
      </View>
      <Text style={styles.title}>{DONE_TEXT[action] || "Saved"}</Text>
      <Text style={styles.name}>{name}</Text>
      <Text style={styles.time}>{new Date(atMs).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  check: { width: 120, height: 120, borderRadius: 60, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", marginBottom: 16 },
  title: { color: "#fff", fontSize: 34, fontWeight: "800" },
  name: { color: "#fff", fontSize: 24, fontWeight: "600" },
  time: { color: "#fff", fontSize: 20 },
});
