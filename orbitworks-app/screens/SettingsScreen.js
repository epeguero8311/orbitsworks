import { View, Text, Switch, TouchableOpacity, StyleSheet } from "react-native";
import { signOut } from "firebase/auth";
import { auth } from "../lib/firebase";
import { useAuth } from "../lib/AuthContext";
import { useTheme } from "../lib/ThemeContext";
import ScreenHeader from "../components/ScreenHeader";

export default function SettingsScreen({ navigation }) {
  const { currentUser } = useAuth();
  const { colors, isDark, toggleTheme } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Settings" onBack={() => navigation.goBack()} />

      <View style={styles.content}>
        <Text style={[styles.sectionLabel, { color: colors.subtext }]}>
          Logged in as
        </Text>
        <Text style={[styles.email, { color: colors.text }]}>
          {currentUser?.email}
        </Text>

        <View style={[styles.row, { borderColor: colors.border }]}>
          <Text style={[styles.rowLabel, { color: colors.text }]}>Dark mode</Text>
          <Switch
            value={isDark}
            onValueChange={toggleTheme}
            trackColor={{ true: colors.accent }}
          />
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={() => signOut(auth)}>
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
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  rowLabel: { fontSize: 15, fontWeight: "500" },
  logoutButton: { marginTop: 32, alignItems: "center", padding: 14 },
  logoutText: { color: "#ef4444", fontSize: 15, fontWeight: "600" },
});
