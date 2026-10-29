import { View, Text, StyleSheet } from "react-native";
import { lightColors as colors, spacing, fontSizes } from "../../lib/theme";

const TONE_COLOR = {
  green: colors.green,
  orange: colors.orange,
  red: colors.red,
  blue: colors.accent,
  neutral: colors.muted,
};
const DOT = 12;

// Vertical timeline: colored dots joined by a thin gray line, each with a
// label and a time. items: [{ id, label, time, tone }].
export default function Timeline({ items }) {
  return (
    <View>
      {items.map((item, i) => (
        <TimelineItem key={item.id} {...item} first={i === 0} last={i === items.length - 1} />
      ))}
    </View>
  );
}

export function TimelineItem({ label, time, tone = "neutral", first, last }) {
  return (
    <View style={styles.item}>
      <View style={styles.rail}>
        <View style={[styles.line, first && styles.hidden]} />
        <View style={[styles.dot, { backgroundColor: TONE_COLOR[tone] || TONE_COLOR.neutral }]} />
        <View style={[styles.line, last && styles.hidden]} />
      </View>
      <View style={styles.body}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.time}>{time}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  item: { flexDirection: "row", minHeight: 56 },
  rail: { width: DOT + spacing.md, alignItems: "center" },
  line: { flex: 1, width: 2, backgroundColor: colors.border },
  hidden: { backgroundColor: "transparent" },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2 },
  body: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingLeft: spacing.sm },
  label: { fontSize: fontSizes.md, fontWeight: "600", color: colors.text },
  time: { fontSize: fontSizes.sm, color: colors.subtext },
});
