import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useAuth } from "../lib/AuthContext";
import { useTheme } from "../lib/ThemeContext";
import Logo from "../components/Logo";

// Employee App (Phase 0 placeholder). The only screen an "employee" role
// login can reach - App.js mounts none of the supervisor screens or
// background syncs for this role. The real Employee Home is Phase 3.
export default function EmployeeHomePlaceholderScreen() {
  const { signOutUser, userData } = useAuth();
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Logo size={48} />
      <Text style={[styles.title, { color: colors.text }]}>Employee home - coming soon</Text>
      <Text style={[styles.message, { color: colors.subtext }]}>
        {userData?.name ? `Hi ${userData.name}. ` : ""}
        Clocking in and out from your own phone is on the way.
      </Text>
      <TouchableOpacity style={[styles.button, { backgroundColor: colors.accent }]} onPress={signOutUser}>
        <Text style={styles.buttonText}>Log Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    marginTop: 16,
    marginBottom: 8,
    textAlign: "center",
  },
  message: {
    fontSize: 14,
    textAlign: "center",
    marginBottom: 24,
  },
  button: {
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
