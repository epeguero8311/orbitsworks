import { Text } from "react-native";
import { spacing, fontSizes } from "../../lib/theme";
import { makeStyles } from "../../lib/makeStyles";
import Card from "./Card";

// Small stat tile: gray label over a bold value ("Today" / "0h 00m").
export default function StatCard({ label, value, style }) {
  const styles = useStyles();
  return (
    <Card style={[styles.card, style]}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </Card>
  );
}

const useStyles = makeStyles((colors) => ({
  card: { flex: 1, paddingVertical: spacing.lg, paddingHorizontal: spacing.lg },
  label: { fontSize: fontSizes.sm, color: colors.subtext, fontWeight: "500" },
  value: { fontSize: fontSizes.xl, color: colors.text, fontWeight: "700", marginTop: spacing.xs, fontVariant: ["tabular-nums"] },
}));
