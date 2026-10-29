import { StyleSheet } from "react-native";
import { useTheme } from "./ThemeContext";

// Theme-aware StyleSheet: makeStyles((colors) => ({ ... })) returns a hook
// that gives the styles for the current light/dark colors. Each color set
// is built once and reused, so switching themes costs nothing per render.
export function makeStyles(factory) {
  const cache = new Map();
  return function useStyles() {
    const { colors } = useTheme();
    let styles = cache.get(colors);
    if (!styles) {
      styles = StyleSheet.create(factory(colors));
      cache.set(colors, styles);
    }
    return styles;
  };
}
