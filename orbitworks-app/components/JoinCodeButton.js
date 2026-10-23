import { TouchableOpacity, Text, StyleSheet } from "react-native";
import { getJoinLinks } from "../lib/pendingJoin";

// "Join with crew code" on the login screen. Hidden on builds that don't
// take crew codes yet (the real app until the Employee App launches).
export default function JoinCodeButton({ onPress }) {
  if (!getJoinLinks()) return null;
  return (
    <TouchableOpacity style={styles.button} onPress={onPress}>
      <Text style={styles.text}>Join with crew code</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    borderWidth: 1.5,
    borderColor: "#3b6fe0",
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 28,
  },
  text: { color: "#3b6fe0", fontSize: 16, fontWeight: "600" },
});
