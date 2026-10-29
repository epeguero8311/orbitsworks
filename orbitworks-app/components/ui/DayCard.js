import { View, Text, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { lightColors as colors, radii, spacing, fontSizes } from "../../lib/theme";

// History day card: day + date top-left, a small clock top-right, and
// Worked (left) / Break (right) along the bottom. Tappable.
export default function DayCard({ dayLabel, dateLabel, worked, breakTime, onPress }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${dayLabel}, ${dateLabel}. Worked ${worked}, break ${breakTime}`}
    >
      <View style={styles.top}>
        <View style={styles.flex}>
          <Text style={styles.day}>{dayLabel}</Text>
          <Text style={styles.date}>{dateLabel}</Text>
        </View>
        <Feather name="clock" size={16} color={colors.muted} />
      </View>
      <View style={styles.bottom}>
        <View>
          <Text style={styles.label}>Worked</Text>
          <Text style={styles.value}>{worked}</Text>
        </View>
        <View style={styles.right}>
          <Text style={styles.label}>Break</Text>
          <Text style={styles.value}>{breakTime}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.xl,
    padding: spacing.xl,
  },
  pressed: { backgroundColor: colors.card },
  top: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  flex: { flex: 1 },
  day: { fontSize: fontSizes.lg, fontWeight: "700", color: colors.text },
  date: { fontSize: fontSizes.sm, color: colors.subtext, marginTop: 2 },
  bottom: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.lg },
  right: { alignItems: "flex-end" },
  label: { fontSize: fontSizes.xs, color: colors.subtext },
  value: { fontSize: fontSizes.lg, fontWeight: "700", color: colors.text, marginTop: 2 },
});
