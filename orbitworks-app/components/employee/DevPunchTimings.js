import { View, Text, StyleSheet } from "react-native";
import { spacing, fontSizes } from "../../lib/theme";
import { makeStyles } from "../../lib/makeStyles";
import { TIMINGS_ENABLED } from "../../lib/punchTimings";
import { timingLines } from "../../lib/punchTimingFormat";
import { usePunchTimings } from "../../lib/hooks/usePunchTimings";
import ListRow from "../ui/ListRow";

const ACTION_LABELS = { in: "Clock in", out: "Clock out", breakStart: "Break start", breakEnd: "Break end" };

function clockLabel(ms) {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

// DEV BUILD ONLY: "Punch timings" section for the Settings tab - the last
// 10 punches with each step's time (lib/punchTimings.js). Renders nothing
// in a prod build or before the first punch.
export default function DevPunchTimings() {
  const styles = useStyles();
  const timings = usePunchTimings();
  if (!TIMINGS_ENABLED || timings.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.heading}>Punch timings (dev build only)</Text>
      {timings.map((t, i) => (
        <ListRow key={`${t.at}-${i}`} divider={i < timings.length - 1}>
          <Text style={styles.title}>
            {ACTION_LABELS[t.action] ?? t.action} at {clockLabel(t.at)} - {t.outcome}
          </Text>
          <Text style={styles.lines}>{timingLines(t).join(" | ")}</Text>
        </ListRow>
      ))}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  section: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginBottom: spacing.xxl,
  },
  heading: { fontSize: fontSizes.xs, color: colors.subtext, paddingTop: spacing.md },
  title: { fontSize: fontSizes.sm, fontWeight: "600", color: colors.text },
  lines: { fontSize: fontSizes.xs, color: colors.subtext, marginTop: 2 },
}));
