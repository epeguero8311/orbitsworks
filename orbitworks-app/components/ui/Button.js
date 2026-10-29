import { TouchableOpacity, Text } from "react-native";
import { radii, spacing, fontSizes } from "../../lib/theme";
import { useTheme } from "../../lib/ThemeContext";
import { makeStyles } from "../../lib/makeStyles";
import Spinner from "../Spinner";

// Theme color name for each tone.
const TONE_COLOR = {
  blue: "accent",
  green: "greenStrong",
  red: "redStrong",
  orange: "orangeStrong",
};

// Full-width button. variant "solid" (filled, white text) or "outline"
// (white with a colored border and text). tone: blue | green | red | orange.
export default function Button({ label, onPress, tone = "blue", variant = "solid", disabled, busy, style }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const color = colors[TONE_COLOR[tone] || TONE_COLOR.blue];
  const solid = variant === "solid";
  return (
    <TouchableOpacity
      style={[
        styles.button,
        solid ? { backgroundColor: color, borderColor: color } : { backgroundColor: colors.surface, borderColor: color },
        (disabled || busy) && styles.disabled,
        style,
      ]}
      onPress={onPress}
      disabled={disabled || busy}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {busy ? (
        <Spinner size={20} color={solid ? colors.onColor : color} />
      ) : (
        <Text style={[styles.text, { color: solid ? colors.onColor : color }]}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

const useStyles = makeStyles((colors) => ({
  button: {
    minHeight: 56,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: { opacity: 0.6 },
  text: { fontSize: fontSizes.lg, fontWeight: "700", letterSpacing: 0.3 },
}));
