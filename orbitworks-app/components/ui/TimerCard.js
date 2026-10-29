import { Text, StyleSheet } from "react-native";
import { lightColors as colors, spacing, fontSizes } from "../../lib/theme";
import Card from "./Card";
import StatusPill from "./StatusPill";

// Centered card: status pill, a large timer, an optional caption line
// ("Started at 7:02 AM") and optional extra content below (progress bar).
export default function TimerCard({ pillLabel, pillTone, time, dimmed, caption, children }) {
  return (
    <Card style={styles.card}>
      <StatusPill label={pillLabel} tone={pillTone} />
      <Text style={[styles.time, { color: dimmed ? colors.muted : colors.text }]} accessibilityRole="timer">
        {time}
      </Text>
      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
      {children}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: "stretch" },
  time: {
    fontSize: fontSizes.timer,
    fontWeight: "700",
    textAlign: "center",
    marginTop: spacing.lg,
    fontVariant: ["tabular-nums"],
    letterSpacing: 1,
  },
  caption: { fontSize: fontSizes.sm, color: colors.subtext, textAlign: "center", marginTop: spacing.xs },
});
