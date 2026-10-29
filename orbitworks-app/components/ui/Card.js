import { View } from "react-native";
import { radii, spacing } from "../../lib/theme";
import { makeStyles } from "../../lib/makeStyles";

// White card with a soft light-gray border and rounded corners.
export default function Card({ children, style }) {
  const styles = useStyles();
  return <View style={[styles.card, style]}>{children}</View>;
}

const useStyles = makeStyles((colors) => ({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.xl,
    padding: spacing.xxl,
  },
}));
