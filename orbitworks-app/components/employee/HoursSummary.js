import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "../../lib/ThemeContext";
import { formatHours } from "../../lib/employeeHome";

// Today's and this week's worked hours (closed shifts, counted the same way
// as the website's Time Tracking page). Read only.
export default function HoursSummary({ todayMs, weekMs }) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <View style={styles.cell}>
        <Text style={[styles.value, { color: colors.text }]}>{formatHours(todayMs)}</Text>
        <Text style={[styles.label, { color: colors.subtext }]}>Today</Text>
      </View>
      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      <View style={styles.cell}>
        <Text style={[styles.value, { color: colors.text }]}>{formatHours(weekMs)}</Text>
        <Text style={[styles.label, { color: colors.subtext }]}>This week</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", marginTop: 16 },
  cell: { alignItems: "center", paddingHorizontal: 20 },
  divider: { width: 1, height: 36 },
  value: { fontSize: 24, fontWeight: "700", fontVariant: ["tabular-nums"] },
  label: { fontSize: 13, marginTop: 2 },
});
