import { Text, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { lightColors as colors, radii, spacing, fontSizes } from "../../lib/theme";
import { INACTIVE_MESSAGE } from "../../lib/employeeHome";
import Card from "../ui/Card";

// Shown on Home instead of the clock buttons when the employee is inactive.
// They stay signed in.
export default function InactiveNotice() {
  return (
    <Card style={styles.box}>
      <Feather name="alert-circle" size={20} color={colors.red} />
      <Text style={styles.text}>{INACTIVE_MESSAGE}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderColor: colors.red,
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  text: { fontSize: fontSizes.md, fontWeight: "600", color: colors.text, flexShrink: 1 },
});
