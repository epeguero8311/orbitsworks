import { useCallback } from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../lib/AuthContext";
import { useTheme } from "../lib/ThemeContext";
import { useEmployeeSelfView } from "../lib/hooks/useEmployeeSelfView";
import { useEmployeeAppConfig } from "../lib/hooks/useEmployeeAppConfig";
import { useMyClockEvents } from "../lib/hooks/useMyClockEvents";
import { useEmployeeHomeSite } from "../lib/hooks/useEmployeeHomeSite";
import { useBreakPunch } from "../lib/hooks/useBreakPunch";
import { useNow } from "../lib/hooks/useNow";
import { BUTTON_ACTION, buttonsFor, computeHours, dayKey, deriveHomeState, formatClockTime, siteLabel } from "../lib/employeeHome";
import HomeHeader from "../components/employee/HomeHeader";
import StatusCard from "../components/employee/StatusCard";
import ClockButtons from "../components/employee/ClockButtons";
import InactiveNotice from "../components/employee/InactiveNotice";
import ConfirmModal from "../components/employee/ConfirmModal";
import PunchConfirmation from "../components/employee/PunchConfirmation";
import Spinner from "../components/Spinner";

const BREAK_QUESTIONS = { breakStart: "Start your break?", breakEnd: "End your break?" };
const BREAK_LABELS = { breakStart: "Start Break", breakEnd: "End Break" };
const BREAK_DONE = { breakStart: "Break started", breakEnd: "Break ended" };

// Employee App Home. Reads only the employee's self view (no PIN), the
// company's employeeAppConfig and their own clock events - all live, so the
// status and timers are right after killing and reopening the app.
export default function EmployeeHomeScreen({ navigation }) {
  const { userData, linkedEmployeeId, signOutUser } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const companyId = userData?.companyId;
  const employeeId = linkedEmployeeId || userData?.employeeId;

  const { view, loading } = useEmployeeSelfView(companyId, employeeId);
  const { timezone, breaks: breakSettings } = useEmployeeAppConfig(companyId);
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
  const clockedOut = home.status === "out" || home.status === "done";
  const nextSite = useEmployeeHomeSite(clockedOut && active, events.recentEvents[0]?.id ?? "none");
  const siteName = clockedOut ? nextSite : home.shiftSiteName;

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
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Spinner size={28} color={colors.accent} />
      </View>
    );
  }

  const done = breakPunch.result;
  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
        <HomeHeader name={view?.name ?? ""} photoUrl={view?.photoUrl} siteName={siteName} />
        <View style={styles.gap} />
        <StatusCard homeState={home} nowMs={now} hours={hours} />
        <View style={styles.gap} />
        {active ? (
          <ClockButtons buttons={buttonsFor(home.status, active)} onPress={onPress} disabled={breakPunch.sending} />
        ) : (
          <InactiveNotice />
        )}
        <TouchableOpacity style={styles.logout} onPress={signOutUser}>
          <Text style={[styles.logoutText, { color: colors.subtext }]}>Log out</Text>
        </TouchableOpacity>
      </ScrollView>

      <ConfirmModal
        visible={!!breakPunch.pending}
        title={BREAK_QUESTIONS[breakPunch.pending] ?? ""}
        confirmLabel={BREAK_LABELS[breakPunch.pending] ?? "OK"}
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

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { paddingHorizontal: 20 },
  gap: { height: 20 },
  logout: { alignSelf: "center", marginTop: 28, padding: 8 },
  logoutText: { fontSize: 14, fontWeight: "500" },
});
