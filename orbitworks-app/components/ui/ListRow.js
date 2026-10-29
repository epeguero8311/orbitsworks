import { View, Pressable, StyleSheet } from "react-native";
import { lightColors as colors, spacing } from "../../lib/theme";

// One row of a plain list: left content, optional right content, and a thin
// gray divider under it (divider={false} on the last row). onPress makes it
// tappable.
export default function ListRow({ children, right, onPress, divider = true, accessibilityLabel }) {
  const body = (
    <>
      <View style={styles.left}>{children}</View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </>
  );
  const style = [styles.row, divider && styles.divider];
  if (!onPress) return <View style={style}>{body}</View>;
  return (
    <Pressable
      style={({ pressed }) => [style, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", minHeight: 52, paddingVertical: spacing.md, gap: spacing.md },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  left: { flex: 1 },
  right: { flexShrink: 0, alignItems: "flex-end" },
  pressed: { opacity: 0.5 },
});
