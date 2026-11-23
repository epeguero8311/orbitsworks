import { View, Text } from "react-native";
import { Feather } from "@expo/vector-icons";
import { radii, spacing, fontSizes } from "../../lib/theme";
import { makeStyles } from "../../lib/makeStyles";
import { useTheme } from "../../lib/ThemeContext";
import { useConnectionBanner } from "../../lib/hooks/useConnectionBanner";

// Thin bar on Employee Home and the PIN screen while the connection is
// missing or weak (lib/hooks/useConnectionBanner.js). Punches still work -
// they're saved on the phone and sync later. Renders nothing otherwise.
export default function ConnectionBanner({ style }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const banner = useConnectionBanner();
  if (!banner.visible) return null;
  return (
    <View style={[styles.bar, style]} accessibilityRole="alert">
      <Feather name={banner.kind === "offline" ? "wifi-off" : "alert-triangle"} size={14} color={colors.orangeText} />
      <Text style={styles.text}>{banner.text}</Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.orangeSoft,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  text: { flex: 1, fontSize: fontSizes.xs, fontWeight: "600", color: colors.orangeText },
}));
