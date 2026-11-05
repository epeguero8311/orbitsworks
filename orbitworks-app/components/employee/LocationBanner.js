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
// Phase 8: trackingOff = this shift is tracked for leaving the job site
// but can't be (no location consent or no Always location). Same bar,
// tap = onFixTracking (the consent / Always screen). Never blocks a punch.
export const TRACKING_OFF_TEXT = "Job site alerts are off. Tap to turn on Always location.";

export default function LocationBanner({ style, trackingOff = false, onFixTracking }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const banner = useLocationBanner();
  const showTracking = !banner.visible && trackingOff && !!onFixTracking;
  if (!banner.visible && !showTracking) return null;
  const text = banner.visible ? banner.text : TRACKING_OFF_TEXT;
  return (
    <TouchableOpacity style={[styles.bar, style]} onPress={banner.visible ? banner.fix : onFixTracking} accessibilityRole="button" accessibilityLabel={text}>
      <Feather name="map-pin" size={14} color={colors.orangeText} />
      <Text style={styles.text}>{text}</Text>
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
