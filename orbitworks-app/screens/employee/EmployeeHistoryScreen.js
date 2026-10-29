import { View, Text } from "react-native";
import { Feather } from "@expo/vector-icons";
import { spacing, fontSizes } from "../../lib/theme";
import { useTheme } from "../../lib/ThemeContext";
import { makeStyles } from "../../lib/makeStyles";
import { useNow } from "../../lib/hooks/useNow";
import { MOCK_CLOCK_EVENTS, MOCK_HISTORY_EMPTY } from "../../lib/mockData";
import { groupEventsByDay, summarizeDay, dayLabel, shortDate, formatWorked, formatDuration } from "../../lib/historyDays";
import TabPage from "../../components/ui/TabPage";
import DayCard from "../../components/ui/DayCard";

// Employee App History tab ("My Hours") - LAYOUT ONLY, mock clock events
// (lib/mockData.js) in the device's timezone. Wiring it up = swapping
// MOCK_CLOCK_EVENTS for the employee's real clockEvents.
export default function EmployeeHistoryScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const now = useNow(60000);
  const days = MOCK_HISTORY_EMPTY ? [] : groupEventsByDay(MOCK_CLOCK_EVENTS);

  return (
    <TabPage title="My Hours" fill={days.length === 0}>
      {days.length === 0 ? (
        <View style={styles.center}>
          <Feather name="clock" size={48} color={colors.muted} />
          <Text style={styles.emptyText}>No hours yet</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {days.map((day) => {
            const summary = summarizeDay(day.events, now);
            return (
              <DayCard
                key={day.key}
                dayLabel={dayLabel(day.key, now)}
                dateLabel={shortDate(day.key)}
                worked={formatWorked(summary.workedMs)}
                breakTime={formatDuration(summary.breakMs)}
                onPress={() => navigation.navigate("EmployeeHistoryDay", { dayKey: day.key })}
              />
            );
          })}
        </View>
      )}
    </TabPage>
  );
}

const useStyles = makeStyles((colors) => ({
  list: { gap: spacing.md },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md },
  emptyText: { fontSize: fontSizes.lg, fontWeight: "600", color: colors.subtext },
}));
