import { View, Text } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "../../lib/AuthContext";
import { spacing, fontSizes } from "../../lib/theme";
import { useTheme } from "../../lib/ThemeContext";
import { makeStyles } from "../../lib/makeStyles";
import { useEmployeeAlerts } from "../../lib/hooks/useEmployeeAlerts";
import { useEmployeeAppConfig } from "../../lib/hooks/useEmployeeAppConfig";
import { useNow } from "../../lib/hooks/useNow";
import { alertTimeLabel } from "../../lib/employeeAlertsView";
import TabPage from "../../components/ui/TabPage";
import EmployeeAlertRow from "../../components/employee/EmployeeAlertRow";
import Spinner from "../../components/Spinner";

// Employee App Alerts tab (Phase 7): the employee's own server alerts merged
// with the break reminders this phone showed, newest first, each with why
// it fired. Read only (lib/hooks/useEmployeeAlerts.js).
export default function EmployeeAlertsScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const { userData, linkedEmployeeId } = useAuth();
  const companyId = userData?.companyId;
  const { alerts, loading } = useEmployeeAlerts(companyId, linkedEmployeeId || userData?.employeeId);
  const { timezone } = useEmployeeAppConfig(companyId);
  const now = useNow(60000);

  return (
    <TabPage title="Alerts" fill={alerts.length === 0}>
      {alerts.length === 0 ? (
        <View style={styles.center}>
          {loading ? <Spinner /> : <Feather name="bell-off" size={48} color={colors.muted} />}
          {loading ? null : <Text style={styles.emptyText}>No alerts</Text>}
        </View>
      ) : (
        alerts.map((alert, i) => (
          <EmployeeAlertRow key={alert.id} alert={alert} timeLabel={alertTimeLabel(alert.atMs, now, timezone)} divider={i < alerts.length - 1} />
        ))
      )}
    </TabPage>
  );
}

const useStyles = makeStyles((colors) => ({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md },
  emptyText: { fontSize: fontSizes.lg, fontWeight: "600", color: colors.subtext },
}));
