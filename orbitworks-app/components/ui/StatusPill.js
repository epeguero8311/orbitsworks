import { View, Text, StyleSheet } from "react-native";
import { lightColors as colors, radii, spacing, fontSizes } from "../../lib/theme";

const TONES = {
  neutral: { bg: colors.neutralSoft, fg: colors.subtext, dot: colors.muted },
  green: { bg: colors.greenSoft, fg: colors.greenText, dot: colors.green },
  orange: { bg: colors.orangeSoft, fg: colors.orangeText, dot: colors.orange },
  blue: { bg: colors.accentSoft, fg: colors.accent, dot: colors.accent },
};

// Small rounded status label with a dot ("Clocked in", "On break").
export default function StatusPill({ label, tone = "neutral" }) {
  const t = TONES[tone] || TONES.neutral;
  return (
    <View style={[styles.pill, { backgroundColor: t.bg }]}>
      <View style={[styles.dot, { backgroundColor: t.dot }]} />
      <Text style={[styles.label, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
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
});
