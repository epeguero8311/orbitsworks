import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useAuth } from "../lib/AuthContext";
import Logo from "../components/Logo";

export default function AccountDisabledScreen() {
  const { signOutUser } = useAuth();

  return (
    <View style={styles.container}>
      <Logo size={48} />
      <Text style={styles.title}>Account deactivated</Text>
      <Text style={styles.message}>
        Your account has been deactivated by your company. If you believe this is a mistake, contact your administrator.
      </Text>
      <TouchableOpacity style={styles.button} onPress={signOutUser}>
        <Text style={styles.buttonText}>Sign Out</Text>
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
    backgroundColor: "#fff",
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111",
    marginTop: 16,
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginBottom: 24,
  },
  button: {
    backgroundColor: "#3b6fe0",
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
