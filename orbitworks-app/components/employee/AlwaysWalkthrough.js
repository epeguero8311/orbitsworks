import { View, Text, Platform } from "react-native";
import { spacing, fontSizes } from "../../lib/theme";
import { makeStyles } from "../../lib/makeStyles";

// Phase 8 (D19): how to turn on "Always" location in the phone's own
// Settings, once the phone won't show its prompt again. iPhone first (the
// doc asks for an iPhone walk-through); Android has its own steps.
const IOS_STEPS = [
  "Tap Open Settings below.",
  "Tap Location.",
  "Choose Always.",
  "Keep Precise Location on.",
  "Come back to OrbitsWorks.",
];
const ANDROID_STEPS = [
  "Tap Open Settings below.",
  "Tap Permissions, then Location.",
  "Choose Allow all the time.",
  "Keep Use precise location on.",
  "Come back to OrbitsWorks.",
];

export const WALKTHROUGH_STEPS = Platform.OS === "android" ? ANDROID_STEPS : IOS_STEPS;

export default function AlwaysWalkthrough() {
  const styles = useStyles();
  return (
    <View style={styles.box}>
      {WALKTHROUGH_STEPS.map((step, i) => (
        <View key={step} style={styles.row}>
          <Text style={styles.num}>{i + 1}</Text>
          <Text style={styles.step}>{step}</Text>
        </View>
      ))}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  box: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: spacing.lg, gap: spacing.md },
  row: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  num: { width: 24, height: 24, borderRadius: 12, overflow: "hidden", textAlign: "center", lineHeight: 24, backgroundColor: colors.accent, color: "#fff", fontWeight: "700", fontSize: fontSizes.sm },
  step: { flex: 1, fontSize: fontSizes.md, color: colors.text, lineHeight: 22 },
}));
