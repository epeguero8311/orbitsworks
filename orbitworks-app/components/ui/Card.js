import { View, StyleSheet } from "react-native";
import { lightColors as colors, radii, spacing } from "../../lib/theme";

// White card with a soft light-gray border and rounded corners.
export default function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.xl,
    padding: spacing.xxl,
  },
});
