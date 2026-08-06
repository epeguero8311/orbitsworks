import { useState, useEffect } from "react";
import { View, Text, Switch, TouchableOpacity, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { signOut } from "firebase/auth";
import { auth } from "../lib/firebase";
import { useAuth } from "../lib/AuthContext";
import { useTheme } from "../lib/ThemeContext";
import ScreenHeader from "../components/ScreenHeader";

const ASK_SITE_KEY = "orbitworks_ask_site_each_time";

export default function SettingsScreen({ navigation }) {
  const { currentUser } = useAuth();
  const { colors, isDark, toggleTheme } = useTheme();
  const [askSite, setAskSite] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(ASK_SITE_KEY).then((val) => {
      if (val !== null) setAskSite(val === "true");
    });
  }, []);

  const handleToggleAskSite = (value) => {
    setAskSite(value);
    AsyncStorage.setItem(ASK_SITE_KEY, String(value));
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Settings" onBack={() => navigation.goBack()} />

      <View style={styles.content}>
        <Text style={[styles.sectionLabel, { color: colors.subtext }]}>Logged in as</Text>
        <Text style={[styles.email, { color: colors.text }]}>{currentUser?.email}</Text>

        <View style={[styles.row, { borderColor: colors.border }]}>
          <View style={styles.rowLeft}>
            <Feather name={isDark ? "moon" : "sun"} size={18} color={colors.text} />
            <Text style={[styles.rowLabel, { color: colors.text }]}>Dark mode</Text>
          </View>
          <Switch value={isDark} onValueChange={toggleTheme} trackColor={{ true: colors.accent }} />
        </View>

        <View style={[styles.row, { borderColor: colors.border }]}>
          <View style={styles.rowLeft}>
            <Feather name="map-pin" size={18} color={colors.text} />
            <Text style={[styles.rowLabel, { color: colors.text }]}>Ask for job site each time</Text>
          </View>
          <Switch value={askSite} onValueChange={handleToggleAskSite} trackColor={{ true: colors.accent }} />
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={() => signOut(auth)}>
          <Feather name="log-out" size={16} color="#ef4444" />
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 24 },
  sectionLabel: { fontSize: 13, marginBottom: 4 },
  email: { fontSize: 16, fontWeight: "600", marginBottom: 24 },
  row: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingVertical: 16, borderTopWidth: 1,
  },
  rowLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  rowLabel: { fontSize: 15, fontWeight: "500" },
  logoutButton: {
    marginTop: 32, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, padding: 14,
  },
  logoutText: { color: "#ef4444", fontSize: 15, fontWeight: "600" },
});
