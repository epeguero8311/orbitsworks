import { View, Text } from "react-native";
import { spacing, fontSizes } from "../../lib/theme";
import { useTheme } from "../../lib/ThemeContext";
import { makeStyles } from "../../lib/makeStyles";
import StatusPill from "./StatusPill";

// Theme color name for each dot tone.
const TONE_COLOR = {
  green: "green",
  orange: "orange",
  red: "red",
  blue: "accent",
  neutral: "muted",
};
const DOT = 12;

// Vertical timeline: colored dots joined by a thin gray line, each with a
// label and a time. items: [{ id, label, time, tone, tag }] - tag is an
// optional { label, tone } StatusPill under the label (Phase 5 sync tags);
// warn shows the label in orange (Missing clock-out).
export default function Timeline({ items }) {
  return (
    <View>
      {items.map((item, i) => (
        <TimelineItem key={item.id} {...item} first={i === 0} last={i === items.length - 1} />
      ))}
    </View>
  );
}

export function TimelineItem({ label, time, tone = "neutral", tag, warn, first, last }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.item}>
      <View style={styles.rail}>
        <View style={[styles.line, first && styles.hidden]} />
        <View style={[styles.dot, { backgroundColor: colors[TONE_COLOR[tone] || TONE_COLOR.neutral] }]} />
        <View style={[styles.line, last && styles.hidden]} />
      </View>
      <View style={styles.body}>
        <View style={styles.labelCol}>
          <Text style={[styles.label, warn && styles.warn]}>{label}</Text>
          {tag ? (
            <View style={styles.tag}>
              <StatusPill label={tag.label} tone={tag.tone} />
            </View>
          ) : null}
        </View>
        {time ? <Text style={styles.time}>{time}</Text> : null}
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  item: { flexDirection: "row", minHeight: 56 },
  rail: { width: DOT + spacing.md, alignItems: "center" },
  line: { flex: 1, width: 2, backgroundColor: colors.border },
  hidden: { backgroundColor: "transparent" },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2 },
  body: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingLeft: spacing.sm },
  labelCol: { flex: 1, alignItems: "flex-start", paddingVertical: spacing.sm },
  label: { fontSize: fontSizes.md, fontWeight: "600", color: colors.text },
  warn: { color: colors.orangeText },
  tag: { marginTop: spacing.xs },
  time: { fontSize: fontSizes.sm, color: colors.subtext },
}));
