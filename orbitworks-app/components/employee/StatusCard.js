import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "../../lib/ThemeContext";
import { formatTimer } from "../../lib/employeeHome";
import HoursSummary from "./HoursSummary";

const TITLES = {
  out: "Clocked out",
  in: "Clocked in",
  break: "On break",
  done: "Done for the day",
};

// Employee Home status card. Clocked in: worked time this shift (breaks
// excluded - it pauses on break). On break: count-up from break start.
// Clocked out / done: today's and this week's hours (read only).
export default function StatusCard({ homeState, nowMs, hours }) {
  const { colors } = useTheme();
  const { status } = homeState;
  const dotColor = status === "in" ? colors.green : status === "break" ? "#f59e0b" : colors.dotOff;

  let timerLabel = null;
  let timer = null;
  if (status === "in") {
    timerLabel = "Shift time";
    timer = formatTimer(homeState.workedMs);
  } else if (status === "break" && homeState.breakStartMs) {
    timerLabel = "Break time";
    timer = formatTimer(nowMs - homeState.breakStartMs);
  }

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.titleRow}>
        <View style={[styles.dot, { backgroundColor: dotColor }]} />
        <Text style={[styles.title, { color: colors.text }]}>{TITLES[status]}</Text>
      </View>
      {timer ? (
        <>
          <Text style={[styles.timer, { color: colors.text }]}>{timer}</Text>
          <Text style={[styles.timerLabel, { color: colors.subtext }]}>{timerLabel}</Text>
        </>
      ) : (
        <HoursSummary todayMs={hours.todayMs} weekMs={hours.weekMs} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, padding: 20, alignItems: "center" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  title: { fontSize: 18, fontWeight: "700" },
  timer: { fontSize: 44, fontWeight: "700", marginTop: 12, fontVariant: ["tabular-nums"] },
  timerLabel: { fontSize: 13, marginTop: 2 },
});
