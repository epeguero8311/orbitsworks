import { TouchableOpacity, Text } from "react-native";
import { Feather } from "@expo/vector-icons";
import { radii, spacing, fontSizes } from "../../lib/theme";
import { makeStyles } from "../../lib/makeStyles";
import { useTheme } from "../../lib/ThemeContext";
import { useLocationBanner } from "../../lib/hooks/useLocationBanner";

// Phase 6: thin bar on Employee Home while location is off (same look as
// ConnectionBanner). Tap: the phone's prompt if never asked, else the
// phone's Settings. Punches still work without it. Renders nothing once
// location is on.
export default function LocationBanner({ style }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const banner = useLocationBanner();
  if (!banner.visible) return null;
  return (
    <TouchableOpacity style={[styles.bar, style]} onPress={banner.fix} accessibilityRole="button" accessibilityLabel={banner.text}>
      <Feather name="map-pin" size={14} color={colors.orangeText} />
      <Text style={styles.text}>{banner.text}</Text>
      <Feather name="chevron-right" size={14} color={colors.orangeText} />
    </TouchableOpacity>
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
