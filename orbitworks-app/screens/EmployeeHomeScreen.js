import { useCallback, useState } from "react";
import { View, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../lib/AuthContext";
import { spacing } from "../lib/theme";
import { useTheme } from "../lib/ThemeContext";
import { makeStyles } from "../lib/makeStyles";
import { useEmployeeSelfView } from "../lib/hooks/useEmployeeSelfView";
import { useEmployeeAppConfig } from "../lib/hooks/useEmployeeAppConfig";
import { useEmployeeHomeSite } from "../lib/hooks/useEmployeeHomeSite";
import { useMyClockEvents } from "../lib/hooks/useMyClockEvents";
import { usePunchQueue } from "../lib/hooks/usePunchQueue";
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
  showsComments,
  siteLabel,
} from "../lib/employeeHome";
import { foldQueuedEvents, lastEventMs, newestFirst, WILL_SYNC_NOTE } from "../lib/punchQueueLogic";
import HomeHeader from "../components/employee/HomeHeader";
import StatusCard from "../components/employee/StatusCard";
import ClockButtons from "../components/employee/ClockButtons";
import HoursSummary from "../components/employee/HoursSummary";
import CommentsButton from "../components/employee/CommentsButton";
import InactiveNotice from "../components/employee/InactiveNotice";
import PunchConfirmation from "../components/employee/PunchConfirmation";
import ConnectionBanner from "../components/employee/ConnectionBanner";
import LocationBanner from "../components/employee/LocationBanner";
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
// Phase 4: punches still saved on the phone count too (a clock-in made
// offline shows "Clocked in" at once), the last copy saved on the phone
// shows on an offline start, and a thin banner shows while the
// connection is missing or weak. Phase 5: while clocked in or on break the
// Comments button takes the hours' place (comments on this shift).
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
  const queue = usePunchQueue(companyId, employeeId);
  const recent = newestFirst(foldQueuedEvents(events.recentEvents, queue.all, companyId, employeeId, minuteNow));
  const week = foldQueuedEvents(events.weekEvents, queue.all, companyId, employeeId, minuteNow);
  const latestType = recent[0]?.type;
  const timerRunning = latestType === "in" || latestType === "breakEnd" || latestType === "breakStart";
  const secondNow = useNow(timerRunning ? 1000 : 60000);
  const now = Math.max(minuteNow, secondNow);

  const home = deriveHomeState(recent, now, timezone);
  const hours = computeHours(week, now, timezone, breakSettings);
  const active = view?.active === true;
  // The employee's subcontractor company if they have one, otherwise the
  // company that created them.
  const company = view?.subcontractorName || companyName;
  const clockedOut = home.status === "out" || home.status === "done";
  // Where a clock-in would land (the last answer saved, when offline).
  const homeSite = useEmployeeHomeSite(clockedOut, events.recentEvents[0]?.id, companyId, employeeId);
  const lastMs = lastEventMs(recent);

  const breakPunch = useBreakPunch({
    companyId,
    employeeId,
    lastEventMs: lastMs,
    siteName: home.shiftSiteName,
  });
  const onPress = useCallback(
    (key) => {
      const action = BUTTON_ACTION[key];
      if (action === "in" || action === "out") {
        const expectedSite = action === "in" ? siteLabel(homeSite) : home.shiftSiteName;
        navigation.navigate("ClockPunch", { action, expectedSite, lastEventMs: lastMs });
      } else {
        breakPunch.ask(action);
      }
    },
    [navigation, breakPunch, homeSite, home.shiftSiteName, lastMs]
  );

  // Break success: Home keeps showing what it showed at the confirm tap
  // until the green overlay is opaque, so the new status never shows
  // through the fade (the confirm box also stays up until then - see
  // useBreakPunch). Released when the overlay is shown or closed, or if
  // saving failed.
  const [held, setHeld] = useState(null);
  const shown = held || { home, hours };
  const openComments = useCallback(
    () => navigation.navigate("ShiftComments", { clockEventId: home.shiftInId, shiftInMs: home.shiftInMs }),
    [navigation, home.shiftInId, home.shiftInMs]
  );
  const onConfirmBreak = async () => {
    if (held) return;
    setHeld({ home, hours });
    const ok = await breakPunch.confirm();
    if (!ok) setHeld(null);
  };
  // Stable (the overlay's 3 s auto-close restarts if onClose changes, and
  // Home re-renders every second while a timer runs).
  const { overlayShown, clearResult } = breakPunch;
  const onOverlayShown = useCallback(() => {
    overlayShown();
    setHeld(null);
  }, [overlayShown]);
  const onOverlayClose = useCallback(() => {
    clearResult();
    setHeld(null);
  }, [clearResult]);

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
        <ConnectionBanner style={styles.banner} />
        <LocationBanner style={styles.banner} />
        <HomeHeader
          name={view?.name ?? ""}
          photoUrl={view?.photoUrl}
          greeting={greetingFor(minuteNow, timezone)}
          companyName={company}
        />
        <View style={styles.gapLarge} />
        <StatusCard
          homeState={shown.home}
          nowMs={now}
          startedLabel={shown.home.shiftInMs ? formatClockTime(shown.home.shiftInMs, timezone) : null}
          maxBreakMinutes={breakSettings?.maxBreakMinutes}
        />
        <View style={styles.gap} />
        {active ? (
          <ClockButtons buttons={buttonsFor(shown.home.status, active)} onPress={onPress} disabled={breakPunch.sending || !!held} />
        ) : (
          <InactiveNotice />
        )}
        <View style={styles.gap} />
        {showsComments(shown.home) ? (
          <CommentsButton onPress={openComments} />
        ) : (
          <HoursSummary todayMs={shown.hours.todayMs} weekMs={shown.hours.weekMs} />
        )}
      </ScrollView>

      <ConfirmModal
        visible={!!breakPunch.pending}
        title={BREAK_QUESTIONS[breakPunch.pending] ?? ""}
        confirmLabel={BREAK_LABELS[breakPunch.pending] ?? "OK"}
        confirmTone="orange"
        error={breakPunch.error}
        busy={breakPunch.sending || !!done}
        onConfirm={onConfirmBreak}
        onCancel={breakPunch.cancel}
      />
      {done ? (
        <PunchConfirmation
          title={BREAK_DONE[done.type]}
          timeLabel={formatClockTime(done.timestampMs, timezone)}
          siteName={siteLabel(done.siteName)}
          note={done.queued ? WILL_SYNC_NOTE : null}
          onClose={onOverlayClose}
          onShown={onOverlayShown}
        />
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  flex: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.xl },
  banner: { marginBottom: spacing.lg },
  gap: { height: spacing.xl },
  gapLarge: { height: spacing.xxl },
}));
