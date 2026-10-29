import { Text } from "react-native";
import { Feather } from "@expo/vector-icons";
import { radii, spacing, fontSizes } from "../../lib/theme";
import { useTheme } from "../../lib/ThemeContext";
import { makeStyles } from "../../lib/makeStyles";
import { INACTIVE_MESSAGE } from "../../lib/employeeHome";
import Card from "../ui/Card";

// Shown on Home instead of the clock buttons when the employee is inactive.
// They stay signed in.
export default function InactiveNotice() {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Card style={styles.box}>
      <Feather name="alert-circle" size={20} color={colors.red} />
      <Text style={styles.text}>{INACTIVE_MESSAGE}</Text>
    </Card>
  );
}

const useStyles = makeStyles((colors) => ({
  box: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderColor: colors.red,
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  text: { fontSize: fontSizes.md, fontWeight: "600", color: colors.text, flexShrink: 1 },
}));
