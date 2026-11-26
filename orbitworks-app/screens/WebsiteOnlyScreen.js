import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useAuth } from "../lib/AuthContext";
import { useTheme } from "../lib/ThemeContext";
import Logo from "../components/Logo";

// Task 5 v2 (B a): an admin whose account type has no app (website only).
// Picking an app type on the website switches this screen the next time
// the app opens or refreshes (RC1 role sync).
export default function WebsiteOnlyScreen() {
  const { signOutUser } = useAuth();
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Logo size={48} />
      <Text style={[styles.title, { color: colors.text }]}>This login is for the website only</Text>
      <Text style={[styles.message, { color: colors.subtext }]}>
        Your account has admin access on the website but no app. Ask the account owner to turn on Employee app or Supervisor app for you.
      </Text>
      <TouchableOpacity style={[styles.button, { backgroundColor: colors.accent }]} onPress={signOutUser}>
        <Text style={styles.buttonText}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  title: { fontSize: 20, fontWeight: "700", marginTop: 16, marginBottom: 8, textAlign: "center" },
  message: { fontSize: 14, textAlign: "center", marginBottom: 24 },
  button: { borderRadius: 8, paddingVertical: 14, paddingHorizontal: 32 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
