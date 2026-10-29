import { useCallback } from "react";
import { View, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../lib/AuthContext";
import { spacing } from "../lib/theme";
import { useTheme } from "../lib/ThemeContext";
import { makeStyles } from "../lib/makeStyles";
import { useEmployeeSelfView } from "../lib/hooks/useEmployeeSelfView";
import { useEmployeeAppConfig } from "../lib/hooks/useEmployeeAppConfig";
import { useMyClockEvents } from "../lib/hooks/useMyClockEvents";
import { useBreakPunch } from "../lib/hooks/useBreakPunch";
import { useNow } from "../lib/hooks/useNow";
import { useTabBarSpace } from "../lib/hooks/useTabBarSpace";
import {
  BUTTON_ACTION,
  buttonsFor,
  computeHours,
  dayKey,
  deriveHomeState,
  formatClockTime,
  greetingFor,
  siteLabel,
} from "../lib/employeeHome";
import HomeHeader from "../components/employee/HomeHeader";
import StatusCard from "../components/employee/StatusCard";
import ClockButtons from "../components/employee/ClockButtons";
import HoursSummary from "../components/employee/HoursSummary";
import InactiveNotice from "../components/employee/InactiveNotice";
import PunchConfirmation from "../components/employee/PunchConfirmation";
import ConfirmModal from "../components/ui/ConfirmModal";
import Spinner from "../components/Spinner";

const BREAK_QUESTIONS = {
  breakStart: "You are about to start your break",
  breakEnd: "You are about to end your break",
};
const BREAK_LABELS = { breakStart: "Start", breakEnd: "End break" };
const BREAK_DONE = { breakStart: "Break started", breakEnd: "Break ended" };

// Employee App Home. Reads only the employee's self view (no PIN), the
// company's employeeAppConfig and their own clock events - all live, so the
// status and timers are right after killing and reopening the app.
export default function EmployeeHomeScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { userData, linkedEmployeeId } = useAuth();
  const insets = useSafeAreaInsets();
  const tabBarSpace = useTabBarSpace();
  const companyId = userData?.companyId;
  const employeeId = linkedEmployeeId || userData?.employeeId;

  const { view, loading } = useEmployeeSelfView(companyId, employeeId);
  const { timezone, breaks: breakSettings, companyName } = useEmployeeAppConfig(companyId);
  // A 1-minute clock moves "today" and the week query at midnight; a
  // 1-second one runs only while a shift or break timer is showing.
  const minuteNow = useNow(60000);
  const events = useMyClockEvents(companyId, employeeId, timezone, dayKey(minuteNow, timezone));
  const latestType = events.recentEvents[0]?.type;
  const timerRunning = latestType === "in" || latestType === "breakEnd" || latestType === "breakStart";
  const secondNow = useNow(timerRunning ? 1000 : 60000);
  const now = Math.max(minuteNow, secondNow);

  const home = deriveHomeState(events.recentEvents, now, timezone);
  const hours = computeHours(events.weekEvents, now, timezone, breakSettings);
  const active = view?.active === true;
  // The employee's subcontractor company if they have one, otherwise the
  // company that created them.
  const company = view?.subcontractorName || companyName;

  const breakPunch = useBreakPunch();
  const onPress = useCallback(
    (key) => {
      const action = BUTTON_ACTION[key];
      if (action === "in" || action === "out") navigation.navigate("ClockPunch", { action });
      else breakPunch.ask(action);
    },
    [navigation, breakPunch]
  );

  if (loading || !events.loaded) {
    return (
      <View style={styles.center}>
        <Spinner size={28} color={colors.accent} />
      </View>
    );
  }

  const done = breakPunch.result;
  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg, paddingBottom: tabBarSpace + spacing.xxl }]}>
        <HomeHeader
          name={view?.name ?? ""}
          photoUrl={view?.photoUrl}
          greeting={greetingFor(minuteNow, timezone)}
          companyName={company}
        />
        <View style={styles.gapLarge} />
        <StatusCard
          homeState={home}
          nowMs={now}
          startedLabel={home.shiftInMs ? formatClockTime(home.shiftInMs, timezone) : null}
          maxBreakMinutes={breakSettings?.maxBreakMinutes}
        />
        <View style={styles.gap} />
        {active ? (
          <ClockButtons buttons={buttonsFor(home.status, active)} onPress={onPress} disabled={breakPunch.sending} />
        ) : (
          <InactiveNotice />
        )}
        <View style={styles.gap} />
        <HoursSummary todayMs={hours.todayMs} weekMs={hours.weekMs} />
      </ScrollView>

      <ConfirmModal
        visible={!!breakPunch.pending}
        title={BREAK_QUESTIONS[breakPunch.pending] ?? ""}
        confirmLabel={BREAK_LABELS[breakPunch.pending] ?? "OK"}
        confirmTone="orange"
        error={breakPunch.error}
        busy={breakPunch.sending}
        onConfirm={breakPunch.confirm}
        onCancel={breakPunch.cancel}
      />
      {done ? (
        <PunchConfirmation
          title={BREAK_DONE[done.type]}
          timeLabel={formatClockTime(done.timestampMs, timezone)}
          siteName={siteLabel(done.siteName)}
          onClose={breakPunch.clearResult}
        />
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  flex: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.xl },
  gap: { height: spacing.xl },
  gapLarge: { height: spacing.xxl },
}));
