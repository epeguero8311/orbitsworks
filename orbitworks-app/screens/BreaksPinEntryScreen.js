import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useAuth } from "../lib/AuthContext";
import { useTheme } from "../lib/ThemeContext";
import { findEmployeeByPin } from "../lib/clockLogic";
import ScreenHeader from "../components/ScreenHeader";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];

// Identifies who is authorizing a break action, not who is going on break -
// the target employees are picked from a list on the next screen. This PIN
// exists so every break event records who was responsible for it.
export default function BreaksPinEntryScreen({ navigation }) {
  const { userData } = useAuth();
  const { colors } = useTheme();
  const [pin, setPin] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  const handleKeyPress = async (key) => {
    if (checking) return;
    setError("");

    if (key === "del") {
      setPin((p) => p.slice(0, -1));
      return;
    }
    if (key === "") return;

    Haptics.selectionAsync();

    const next = pin + key;
    setPin(next);

    if (next.length === 4) {
      setChecking(true);
      const employee = await findEmployeeByPin(userData.companyId, next);
      setChecking(false);

      if (!employee) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setError("PIN not recognized");
        setPin("");
        return;
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.replace("BreaksEmployeeList", { authorizedBy: employee });
      setPin("");
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Breaks" onBack={() => navigation.goBack()} />

      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.text }]}>Enter your PIN</Text>
        <Text style={[styles.subtitle, { color: colors.subtext }]}>
          This identifies who is authorizing the break
        </Text>

        <View style={styles.dotsRow}>
          {[0, 1, 2, 3].map((i) => (
            <View
              key={i}
              style={[
                styles.dot,
                { borderColor: colors.border },
                i < pin.length && { backgroundColor: colors.accent, borderColor: colors.accent },
              ]}
            />
          ))}
        </View>

        {checking && <ActivityIndicator style={{ marginTop: 12 }} color={colors.accent} />}
        {error ? <Text style={[styles.error, { color: colors.red }]}>{error}</Text> : null}

        <View style={styles.keypad}>
          {KEYS.map((key, i) => (
            <TouchableOpacity
              key={i}
              style={[styles.key, key === "" && styles.keyHidden]}
              onPress={() => handleKeyPress(key)}
              disabled={key === ""}
            >
              {key === "del" ? (
                <Feather name="delete" size={26} color={colors.text} />
              ) : (
                <Text style={[styles.keyText, { color: colors.text }]}>{key}</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { alignItems: "center", paddingTop: 24 },
  title: { fontSize: 20, fontWeight: "700", marginBottom: 6 },
  subtitle: { fontSize: 13, marginBottom: 18, textAlign: "center", paddingHorizontal: 40 },
  dotsRow: { flexDirection: "row", marginBottom: 8 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 1, marginHorizontal: 8 },
  error: { marginTop: 12 },
  keypad: { flexDirection: "row", flexWrap: "wrap", width: 280, marginTop: 32, justifyContent: "center" },
  key: { width: 80, height: 80, justifyContent: "center", alignItems: "center" },
  keyHidden: { opacity: 0 },
  keyText: { fontSize: 26, fontWeight: "600" },
});