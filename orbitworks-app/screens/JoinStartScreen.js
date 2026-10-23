import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { clearPendingJoinToken } from "../lib/pendingJoin";
import Logo from "../components/Logo";

// Part B placeholder: proves a crew code reached the app (from a link or
// the scanner). Part C replaces this with the sign-up screens. The token
// is read from lib/pendingJoin.js, never shown.
export default function JoinStartScreen({ navigation }) {
  const cancel = () => {
    clearPendingJoinToken();
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate("Login");
  };

  return (
    <View style={styles.root}>
      <Logo size={40} />
      <Text style={styles.title}>Crew code found</Text>
      <Text style={styles.body}>Sign-up is coming in the next test build.</Text>
      <TouchableOpacity style={styles.button} onPress={cancel}>
        <Text style={styles.buttonText}>Back to login</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28, backgroundColor: "#fff" },
  title: { fontSize: 20, fontWeight: "700", color: "#111", marginTop: 28, marginBottom: 8 },
  body: { fontSize: 15, color: "#374151", textAlign: "center", marginBottom: 24 },
  button: { backgroundColor: "#3b6fe0", borderRadius: 999, paddingVertical: 14, paddingHorizontal: 40 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
