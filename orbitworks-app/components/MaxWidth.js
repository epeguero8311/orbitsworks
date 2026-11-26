import { View, StyleSheet } from "react-native";
import { useTheme } from "../lib/ThemeContext";
import { CONTENT_MAX_WIDTH } from "../lib/tabletLayout";

// Task 7 (tablet landscape): a screen centered at CONTENT_MAX_WIDTH on a
// tablet, with the theme background filling the sides. No effect on a
// phone (always narrower). withMaxWidth(Screen) is used for the navigator's
// `component` (module level, so its identity never changes between renders).
export function MaxWidth({ children }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.outer, { backgroundColor: colors.background }]}>
      <View style={styles.inner}>{children}</View>
    </View>
  );
}

export function withMaxWidth(Screen) {
  function Wrapped(props) {
    return (
      <MaxWidth>
        <Screen {...props} />
      </MaxWidth>
    );
  }
  Wrapped.displayName = `MaxWidth(${Screen.displayName || Screen.name || "Screen"})`;
  return Wrapped;
}

const styles = StyleSheet.create({
  outer: { flex: 1, alignItems: "center" },
  inner: { flex: 1, width: "100%", maxWidth: CONTENT_MAX_WIDTH },
});
