import { View, Text } from "react-native";
import Spinner from "./Spinner";
import { spacing, fontSizes } from "../lib/theme";
import { makeStyles } from "../lib/makeStyles";
import { useTheme } from "../lib/ThemeContext";

// RC1: shown in place of every screen while a role change made on the
// website is applied (AuthContext roleUpdate step "sending"/"switching").
// No punch can be started meanwhile, so nothing is made with a role the
// token no longer (or not yet) has.
const LINES = {
  sending: "Sending what's saved on this phone first...",
  switching: "Getting your new access...",
};

export default function RoleUpdating({ kind, step }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const title =
    kind === "promotion"
      ? "You're now a supervisor"
      : kind === "demotion"
        ? "Your access changed"
        : "Updating your access";
  return (
    <View style={styles.container} accessibilityLiveRegion="polite">
      <Spinner size={44} color={colors.accent} />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.line}>{LINES[step] ?? LINES.switching}</Text>
      <Text style={styles.hint}>Keep the app open. This takes a few seconds.</Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xxl,
  },
  title: { fontSize: fontSizes.xl, fontWeight: "700", color: colors.text, marginTop: spacing.xxl, textAlign: "center" },
  line: { fontSize: fontSizes.md, color: colors.text, marginTop: spacing.md, textAlign: "center" },
  hint: { fontSize: fontSizes.sm, color: colors.subtext, marginTop: spacing.sm, textAlign: "center" },
}));
