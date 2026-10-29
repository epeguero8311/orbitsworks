import { View, Text, Pressable, ScrollView } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { radii, spacing, fontSizes } from "../../lib/theme";
import { useTheme } from "../../lib/ThemeContext";
import { makeStyles } from "../../lib/makeStyles";
import { useTabBarSpace } from "../../lib/hooks/useTabBarSpace";
import { useNow } from "../../lib/hooks/useNow";
import { MOCK_CLOCK_EVENTS } from "../../lib/mockData";
import { groupEventsByDay, summarizeDay, longDate, weekdayLabel, formatDuration, timelineItems } from "../../lib/historyDays";
import SummaryStats from "../../components/ui/SummaryStats";
import Timeline from "../../components/ui/Timeline";

// Employee App History - one day: date, Shift / Hours worked / Break, and
// the day's punches as a timeline. LAYOUT ONLY, mock clock events.
// route.params: { dayKey: "YYYY-MM-DD" }.
export default function EmployeeHistoryDayScreen({ route, navigation }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const tabBarSpace = useTabBarSpace();
  const key = route.params?.dayKey ?? "";
  const day = groupEventsByDay(MOCK_CLOCK_EVENTS).find((d) => d.key === key);
  const events = day ? day.events : [];
  const now = useNow(60000);
  const summary = summarizeDay(events, now);

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg, paddingBottom: tabBarSpace + spacing.xxl }]}
    >
      <Pressable
        style={({ pressed }) => [styles.back, pressed && styles.pressed]}
        onPress={() => navigation.goBack()}
        hitSlop={4}
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        <Feather name="arrow-left" size={20} color={colors.text} />
      </Pressable>

      {key ? (
        <>
          <Text style={styles.date}>{longDate(key)}</Text>
          <Text style={styles.weekday}>{weekdayLabel(key)}</Text>
        </>
      ) : null}

      <View style={styles.section}>
        <SummaryStats
          items={[
            { label: "Shift Time", value: formatDuration(summary.shiftMs) },
            { label: "Hours worked", value: formatDuration(summary.workedMs) },
            { label: "Break", value: formatDuration(summary.breakMs) },
          ]}
        />
      </View>

      <Text style={styles.heading}>Activity</Text>
      {events.length ? <Timeline items={timelineItems(events)} /> : <Text style={styles.empty}>No activity</Text>}
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  page: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.xl },
  back: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  pressed: { backgroundColor: colors.card },
  date: { fontSize: fontSizes.xxl, fontWeight: "800", color: colors.text },
  weekday: { fontSize: fontSizes.md, color: colors.subtext, marginTop: 2 },
  section: { marginTop: spacing.xl, marginBottom: spacing.xxl },
  heading: { fontSize: fontSizes.lg, fontWeight: "700", color: colors.text, marginBottom: spacing.sm },
  empty: { fontSize: fontSizes.sm, color: colors.subtext },
}));
