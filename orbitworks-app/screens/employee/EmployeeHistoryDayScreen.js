import { View, Text, Pressable, ScrollView } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { radii, spacing, fontSizes } from "../../lib/theme";
import { useTheme } from "../../lib/ThemeContext";
import { makeStyles } from "../../lib/makeStyles";
import { useTabBarSpace } from "../../lib/hooks/useTabBarSpace";
import { useAuth } from "../../lib/AuthContext";
import { useMyHistoryWeek } from "../../lib/hooks/useMyHistoryWeek";
import { findDay, longDate, weekdayLabel, formatDuration, timelineRows } from "../../lib/historyDays";
import SummaryStats from "../../components/ui/SummaryStats";
import Timeline from "../../components/ui/Timeline";

// Employee App History - one day of this week (Phase 5): date, Shift /
// Hours worked / Break (Home's rule: closed shifts only, auto break on), and
// every punch and break in company time with its sync tag (Will sync, Synced
// late, Not synced), then "In progress" or "Missing clock-out" (orange).
// Read only. A day off, or a day outside this week, shows "No activity".
// route.params: { dayKey: "YYYY-MM-DD" }.
export default function EmployeeHistoryDayScreen({ route, navigation }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const tabBarSpace = useTabBarSpace();
  const key = route.params?.dayKey ?? "";
  const { userData, linkedEmployeeId } = useAuth();
  const companyId = userData?.companyId;
  const employeeId = linkedEmployeeId || userData?.employeeId;
  const { days } = useMyHistoryWeek(companyId, employeeId);
  const day = findDay(days, key);
  const rows = timelineRows(day);

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
            { label: "Shift Time", value: formatDuration(day ? day.shiftMs : 0) },
            { label: "Hours worked", value: formatDuration(day ? day.workedMs : 0) },
            { label: "Break", value: formatDuration(day ? day.breakMs : 0) },
          ]}
        />
      </View>

      <Text style={styles.heading}>Activity</Text>
      {rows.length ? <Timeline items={rows} /> : <Text style={styles.empty}>No activity</Text>}
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
