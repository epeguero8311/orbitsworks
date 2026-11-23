import { View, Text } from "react-native";
import { spacing, fontSizes } from "../../lib/theme";
import { makeStyles } from "../../lib/makeStyles";
import ListRow from "../ui/ListRow";

// Employee App Phase 7 - one Alerts tab row: title + time, the message, and
// why it fired (muted). Same look as the ui-refresh mock rows.
export default function EmployeeAlertRow({ alert, timeLabel, divider }) {
  const styles = useStyles();
  return (
    <ListRow divider={divider}>
      <View style={styles.top}>
        <Text style={styles.title} numberOfLines={1}>
          {alert.title}
        </Text>
        <Text style={styles.time}>{timeLabel}</Text>
      </View>
      {alert.message ? <Text style={styles.description}>{alert.message}</Text> : null}
      {alert.reason ? <Text style={styles.reason}>{alert.reason}</Text> : null}
    </ListRow>
  );
}

const useStyles = makeStyles((colors) => ({
  top: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: spacing.md },
  title: { flex: 1, fontSize: fontSizes.md, fontWeight: "700", color: colors.text },
  time: { fontSize: fontSizes.sm, color: colors.subtext },
  description: { fontSize: fontSizes.sm, color: colors.subtext, marginTop: spacing.xs, lineHeight: 18 },
  reason: { fontSize: fontSizes.xs, color: colors.muted, marginTop: spacing.xs, lineHeight: 16 },
}));
