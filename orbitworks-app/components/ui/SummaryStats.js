import { View, Text, StyleSheet } from "react-native";
import { radii, spacing, fontSizes } from "../../lib/theme";
import { makeStyles } from "../../lib/makeStyles";

// Card of side-by-side stats: a small gray label over a bold value, with
// thin dividers between columns. items: [{ label, value }].
export default function SummaryStats({ items }) {
  const styles = useStyles();
  return (
    <View style={styles.card}>
      {items.map((item, i) => (
        <View key={item.label} style={[styles.col, i > 0 && styles.divider]}>
          <Text style={styles.label} numberOfLines={1}>
            {item.label}
          </Text>
          <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
            {item.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  card: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.xl,
    paddingVertical: spacing.lg,
  },
  col: { flex: 1, alignItems: "center", paddingHorizontal: spacing.sm },
  divider: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.border },
  label: { fontSize: fontSizes.xs, color: colors.subtext },
  value: { fontSize: fontSizes.md, fontWeight: "700", color: colors.text, marginTop: spacing.xs },
}));
