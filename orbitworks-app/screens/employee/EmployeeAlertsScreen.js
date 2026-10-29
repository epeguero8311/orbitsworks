import { View, Text } from "react-native";
import { Feather } from "@expo/vector-icons";
import { spacing, fontSizes } from "../../lib/theme";
import { useTheme } from "../../lib/ThemeContext";
import { makeStyles } from "../../lib/makeStyles";
import { MOCK_ALERTS, MOCK_ALERTS_EMPTY } from "../../lib/mockData";
import TabPage from "../../components/ui/TabPage";
import ListRow from "../../components/ui/ListRow";

// Employee App Alerts tab - LAYOUT ONLY, mock data (lib/mockData.js).
export default function EmployeeAlertsScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const alerts = MOCK_ALERTS_EMPTY ? [] : MOCK_ALERTS;

  return (
    <TabPage title="Alerts" fill={alerts.length === 0}>
      {alerts.length === 0 ? (
        <View style={styles.center}>
          <Feather name="bell-off" size={48} color={colors.muted} />
          <Text style={styles.emptyText}>No alerts</Text>
        </View>
      ) : (
        alerts.map((alert, i) => (
          <ListRow key={alert.id} divider={i < alerts.length - 1}>
            <View style={styles.top}>
              <Text style={styles.title} numberOfLines={1}>
                {alert.title}
              </Text>
              <Text style={styles.time}>{alert.time}</Text>
            </View>
            <Text style={styles.description}>{alert.description}</Text>
          </ListRow>
        ))
      )}
    </TabPage>
  );
}

const useStyles = makeStyles((colors) => ({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md },
  emptyText: { fontSize: fontSizes.lg, fontWeight: "600", color: colors.subtext },
  top: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: spacing.md },
  title: { flex: 1, fontSize: fontSizes.md, fontWeight: "700", color: colors.text },
  time: { fontSize: fontSizes.sm, color: colors.subtext },
  description: { fontSize: fontSizes.sm, color: colors.subtext, marginTop: spacing.xs, lineHeight: 18 },
}));
