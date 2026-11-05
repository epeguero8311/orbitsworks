import { useCallback } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useAuth } from "../lib/AuthContext";
import { useTheme } from "../lib/ThemeContext";
import { useClockPunch } from "../lib/hooks/useClockPunch";
import { useEmployeeAppConfig } from "../lib/hooks/useEmployeeAppConfig";
import { useEmployeeSelfView } from "../lib/hooks/useEmployeeSelfView";
import { useNow } from "../lib/hooks/useNow";
import { formatClockTime, siteLabel } from "../lib/employeeHome";
import { WILL_SYNC_NOTE } from "../lib/punchQueueLogic";
import { askNotificationsAfterFirstClockIn } from "../lib/notificationPermission";
import { shouldAskAlways } from "../lib/alwaysLocationAsk";
import { navigationRef } from "../lib/navigationRef";
import ScreenHeader from "../components/ScreenHeader";
import PinPad from "../components/employee/PinPad";
import PunchCamera from "../components/employee/PunchCamera";
import PunchConfirmation from "../components/employee/PunchConfirmation";
import ConnectionBanner from "../components/employee/ConnectionBanner";
import Building2Icon from "../components/icons/Building2Icon";

const TITLES = { in: "Clock In", out: "Clock Out" };
// Lets the screen finish closing before the notifications question shows.
const ASK_AFTER_CLOSE_MS = 600;
const DONE_TITLES = { in: "Clocked in", out: "Clocked out" };

// Employee App clock in / out: PIN -> live front-camera photo right away
// (retake allowed) while the server checks the PIN; a wrong PIN or the lock
// closes the camera and shows here -> saved on the phone -> green
// confirmation at once, with the expected site. The phone's queue sends it
// straight away (lib/hooks/useClockPunch.js). With no or weak signal the
// confirmation also shows "Will sync when online". Every error message is
// the server's own plain message, or "No signal". (Phase 5: no Redo.)
// params: action, expectedSite, lastEventMs
export default function ClockPunchScreen({ route, navigation }) {
  const params = route.params || {};
  const action = params.action === "out" ? "out" : "in";
  const { userData, linkedEmployeeId } = useAuth();
  const { colors } = useTheme();
  const companyId = userData?.companyId;
  const { timezone, companyName } = useEmployeeAppConfig(companyId);
  const employeeId = linkedEmployeeId || userData?.employeeId;
  const { view } = useEmployeeSelfView(companyId, employeeId);
  // The employee's subcontractor company if they have one, otherwise the
  // company that created them.
  const company = view?.subcontractorName || companyName;
  const flow = useClockPunch({
    action,
    companyId,
    employeeId,
    expectedSite: params.expectedSite || "",
    lastEventMs: typeof params.lastEventMs === "number" ? params.lastEventMs : null,
  });
  const now = useNow(1000);
  const lockSeconds = flow.lockedUntil > now ? Math.ceil((flow.lockedUntil - now) / 1000) : 0;
  const close = useCallback(() => navigation.goBack(), [navigation]);
  // Phase 7: after the first clock-in's green screen closes (never in front
  // of a punch), ask once for notifications - lib/notificationPermission.js.
  const resultType = flow.result?.type;
  // Phase 8 (D19): then, once, the job site alerts screen (location consent
  // + Always) after a Pro clock-in at a geofenced site. Both only after the
  // punch is saved and its screen closed - never in front of a punch.
  const closeDone = useCallback(() => {
    navigation.goBack();
    if (resultType !== "in") return;
    setTimeout(async () => {
      await askNotificationsAfterFirstClockIn();
      if ((await shouldAskAlways(companyId, employeeId)) && navigationRef.isReady()) navigationRef.navigate("AlwaysLocation");
    }, ASK_AFTER_CLOSE_MS);
  }, [navigation, resultType, companyId, employeeId]);

  // The green overlay shows as soon as the punch is saved. Whatever was on
  // screen (the photo preview) stays under it until it
  // is opaque (flow.overlayShown -> step "done"), so nothing changes
  // behind the fade. Always <>{body}{overlay}</>, so the camera isn't
  // remounted when the overlay appears.
  const overlay = flow.result ? (
    <PunchConfirmation
      title={DONE_TITLES[flow.result.type] ?? TITLES[action]}
      timeLabel={formatClockTime(flow.result.timestampMs, timezone)}
      siteName={siteLabel(flow.result.siteName)}
      note={flow.result.queued ? WILL_SYNC_NOTE : null}
      photoUri={flow.photoUri}
      onClose={closeDone}
      onShown={flow.overlayShown}
    />
  ) : null;

  if (flow.step === "camera") {
    return (
      <>
        <PunchCamera onUse={flow.submitPhoto} onCancel={close} />
        {overlay}
      </>
    );
  }

  if (flow.step === "done") {
    return (
      <>
        <View style={[styles.container, { backgroundColor: colors.background }]} />
        {overlay}
      </>
    );
  }

  const lockedMessage = lockSeconds > 0 ? `Too many wrong PINs. Try again in ${lockSeconds} second${lockSeconds === 1 ? "" : "s"}.` : "";
  // While a lock applies, only the live countdown shows (never a stale one).
  const message = flow.lockedUntil > 0 ? lockedMessage : flow.error;

  return (
    <>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScreenHeader title={TITLES[action]} onBack={close} />
        <ConnectionBanner style={styles.banner} />
        <View style={styles.content}>
          {flow.step === "pin" ? (
            <>
              {company ? (
                <View style={[styles.companyPill, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Building2Icon size={13} color={colors.accent} />
                  <Text style={[styles.companyPillText, { color: colors.accent }]} numberOfLines={1}>
                    {company}
                  </Text>
                </View>
              ) : null}
              <Text style={[styles.title, { color: colors.text }]}>Enter your PIN</Text>
              <PinPad length={flow.pin.length} onDigit={flow.pressDigit} onDelete={flow.deleteDigit} disabled={lockSeconds > 0} />
            </>
          ) : null}

          {message ? <Text style={[styles.error, { color: colors.red }]}>{message}</Text> : null}

          {flow.step === "retry" ? (
            <TouchableOpacity style={[styles.button, { backgroundColor: colors.accent }]} onPress={flow.retry}>
              <Text style={styles.buttonText}>Try again</Text>
            </TouchableOpacity>
          ) : null}
          {flow.step === "failed" || flow.step === "retry" ? (
            <TouchableOpacity style={styles.link} onPress={close}>
              <Text style={[styles.linkText, { color: colors.accent }]}>Back to Home</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
      {overlay}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  banner: { marginHorizontal: 24, marginTop: 8 },
  content: { alignItems: "center", paddingTop: 24, paddingHorizontal: 24 },
  // Same pill as the site tag on the supervisor PIN screen.
  companyPill: {
    flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14,
    paddingVertical: 7, borderRadius: 20, borderWidth: 1, marginBottom: 20, maxWidth: "100%",
  },
  companyPillText: { fontSize: 13, fontWeight: "600", flexShrink: 1 },
  title: { fontSize: 20, fontWeight: "700", marginBottom: 24 },
  error: { marginTop: 16, fontSize: 15, textAlign: "center" },
  button: { marginTop: 24, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 40 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  link: { marginTop: 16, padding: 8 },
  linkText: { fontSize: 15, fontWeight: "600" },
});
