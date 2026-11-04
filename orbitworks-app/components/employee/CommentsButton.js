import { View, Text, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { radii, spacing, fontSizes } from "../../lib/theme";
import { useTheme } from "../../lib/ThemeContext";
import { makeStyles } from "../../lib/makeStyles";

// Home, while clocked in or on break (Phase 5, decision 12): takes the
// hours cards' place and opens this shift's Comments. Same card look as
// StatCard / DayCard.
export default function CommentsButton({ onPress }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Comments on this shift"
    >
      <Feather name="message-square" size={20} color={colors.accent} />
      <View style={styles.flex}>
        <Text style={styles.title}>Comments</Text>
        <Text style={styles.sub}>Add a note about this shift</Text>
      </View>
      <Feather name="chevron-right" size={20} color={colors.muted} />
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.xl,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  pressed: { backgroundColor: colors.card },
  flex: { flex: 1 },
  title: { fontSize: fontSizes.md, fontWeight: "700", color: colors.text },
  sub: { fontSize: fontSizes.sm, color: colors.subtext, marginTop: 2 },
}));
