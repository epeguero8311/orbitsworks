import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useAuth } from "../lib/AuthContext";
import { useTheme } from "../lib/ThemeContext";
import { useSiteSession } from "../lib/SiteSessionContext";
import { findEmployeeByPin } from "../lib/clockLogic";
import ScreenHeader from "../components/ScreenHeader";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];

export default function PinEntryScreen({ navigation }) {
  const { userData } = useAuth();
  const { colors } = useTheme();
  const { selectedSite } = useSiteSession();
  const [pin, setPin] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  const siteLabel = selectedSite
    ? selectedSite.id === "none"
      ? "No Site"
      : selectedSite.name
    : "All Sites";

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
      navigation.navigate("ClockCamera", { employee });
      setPin("");
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Clock In / Out" onBack={() => navigation.goBack()} />

      <View style={styles.content}>
        <View style={[styles.sitePill, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="map-pin" size={13} color={colors.accent} />
          <Text style={[styles.sitePillText, { color: colors.accent }]}>{siteLabel}</Text>
        </View>

        <Text style={[styles.title, { color: colors.text }]}>Enter your PIN</Text>

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
  sitePill: {
    flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14,
    paddingVertical: 7, borderRadius: 20, borderWidth: 1, marginBottom: 20,
  },
  sitePillText: { fontSize: 13, fontWeight: "600" },
  title: { fontSize: 20, fontWeight: "700", marginBottom: 24 },
  dotsRow: { flexDirection: "row", marginBottom: 8 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 1, marginHorizontal: 8 },
  error: { marginTop: 12 },
  keypad: { flexDirection: "row", flexWrap: "wrap", width: 280, marginTop: 32, justifyContent: "center" },
  key: { width: 80, height: 80, justifyContent: "center", alignItems: "center" },
  keyHidden: { opacity: 0 },
  keyText: { fontSize: 26, fontWeight: "600" },
});
