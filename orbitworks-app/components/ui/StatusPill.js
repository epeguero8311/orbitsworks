import { View, Text } from "react-native";
import { radii, spacing, fontSizes } from "../../lib/theme";
import { useTheme } from "../../lib/ThemeContext";
import { makeStyles } from "../../lib/makeStyles";

// Theme color names for each tone.
const TONES = {
  neutral: { bg: "neutralSoft", fg: "subtext", dot: "muted" },
  green: { bg: "greenSoft", fg: "greenText", dot: "green" },
  orange: { bg: "orangeSoft", fg: "orangeText", dot: "orange" },
  blue: { bg: "accentSoft", fg: "accent", dot: "accent" },
  // No soft red in the theme: the red at low opacity (hex alpha) instead.
  red: { bg: "red", bgAlpha: "22", fg: "redStrong", dot: "red" },
};

// Small rounded status label with a dot ("Clocked in", "On break").
// tone: neutral | green | orange | blue | red (Sync tab "Failed").
export default function StatusPill({ label, tone = "neutral" }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const t = TONES[tone] || TONES.neutral;
  return (
    <View style={[styles.pill, { backgroundColor: colors[t.bg] + (t.bgAlpha || "") }]}>
      <View style={[styles.dot, { backgroundColor: colors[t.dot] }]} />
      <Text style={[styles.label, { color: colors[t.fg] }]}>{label}</Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radii.pill,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  label: { fontSize: fontSizes.sm, fontWeight: "600" },
}));
