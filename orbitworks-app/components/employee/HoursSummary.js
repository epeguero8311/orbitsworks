import { View, StyleSheet } from "react-native";
import { spacing } from "../../lib/theme";
import { formatHours } from "../../lib/employeeHome";
import StatCard from "../ui/StatCard";

// Today's and this week's worked hours (closed shifts, counted the same way
// as the website's Time Tracking page), as two stat cards. Read only.
export default function HoursSummary({ todayMs, weekMs }) {
  return (
    <View style={styles.row}>
      <StatCard label="Today" value={formatHours(todayMs)} />
      <StatCard label="This week" value={formatHours(weekMs)} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: spacing.md },
});
