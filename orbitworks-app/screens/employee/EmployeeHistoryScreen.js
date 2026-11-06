import { View, Text, ActivityIndicator } from "react-native";
import { spacing, fontSizes } from "../../lib/theme";
import { useTheme } from "../../lib/ThemeContext";
import { makeStyles } from "../../lib/makeStyles";
import { useAuth } from "../../lib/AuthContext";
import { useMyHistoryWeek } from "../../lib/hooks/useMyHistoryWeek";
import { dayBadges, formatWorked, formatDuration, workedDays } from "../../lib/historyDays";
import TabPage from "../../components/ui/TabPage";
import DayCard from "../../components/ui/DayCard";

// Employee App History tab ("My Hours"), Phase 5: this week, Monday to
// today in the company's time zone, newest first - the employee's real
// clock events plus the punches still on the phone (useMyHistoryWeek).
// Only days worked are listed - no row for a day off (workedDays keeps an
// In progress / Missing clock-out / Not synced day too). Hours use Home's
// rule. Each card shows what needs attention (Missing clock-out, In
// progress, sync tags); tap a day for every punch and break.
export default function EmployeeHistoryScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { userData, linkedEmployeeId } = useAuth();
  const companyId = userData?.companyId;
  const employeeId = linkedEmployeeId || userData?.employeeId;
  const { days, loaded } = useMyHistoryWeek(companyId, employeeId);
  const shown = workedDays(days);

  return (
    <TabPage title="My Hours" fill={!loaded}>
      {!loaded ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.muted} />
        </View>
      ) : (
        <View style={styles.list}>
          {shown.length === 0 ? <Text style={styles.empty}>No hours worked yet this week.</Text> : null}
          {shown.map((day) => (
            <DayCard
              key={day.key}
              dayLabel={day.label}
              dateLabel={day.dateLabel}
              worked={formatWorked(day.workedMs)}
              breakTime={formatDuration(day.breakMs)}
              badges={dayBadges(day)}
              onPress={() => navigation.navigate("EmployeeHistoryDay", { dayKey: day.key })}
            />
          ))}
        </View>
      )}
    </TabPage>
  );
}

const useStyles = makeStyles((colors) => ({
  list: { gap: spacing.md },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { fontSize: fontSizes.sm, color: colors.subtext },
}));
