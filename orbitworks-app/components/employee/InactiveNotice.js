import { View, Text, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../../lib/ThemeContext";
import { INACTIVE_MESSAGE } from "../../lib/employeeHome";

// Shown on Home instead of the clock buttons when the employee is inactive.
// They stay signed in.
export default function InactiveNotice() {
  const { colors } = useTheme();
  return (
    <View style={[styles.box, { backgroundColor: colors.card, borderColor: colors.red }]}>
      <Feather name="alert-circle" size={20} color={colors.red} />
      <Text style={[styles.text, { color: colors.text }]}>{INACTIVE_MESSAGE}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 12, padding: 16 },
  text: { fontSize: 15, fontWeight: "600", flexShrink: 1 },
});
