import { View, Text, StyleSheet } from "react-native";
import { lightColors as colors, radii, spacing, fontSizes } from "../../lib/theme";

// Thin rounded bar. progress 0..1 (clamped), small labels under each end.
export default function ProgressBar({ progress, color = colors.orange, startLabel, endLabel }) {
  const pct = Math.min(1, Math.max(0, progress || 0)) * 100;
  return (
    <View style={styles.wrap}>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
      {startLabel || endLabel ? (
        <View style={styles.labels}>
          <Text style={styles.label}>{startLabel}</Text>
          <Text style={styles.label}>{endLabel}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.xl },
  track: { height: 8, borderRadius: radii.pill, backgroundColor: colors.track, overflow: "hidden" },
  fill: { height: "100%", borderRadius: radii.pill },
  labels: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.sm },
  label: { fontSize: fontSizes.xs, color: colors.subtext, fontWeight: "500" },
});
