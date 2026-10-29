import { useCallback } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useAuth } from "../lib/AuthContext";
import { useTheme } from "../lib/ThemeContext";
import { useClockPunch } from "../lib/hooks/useClockPunch";
import { useEmployeeAppConfig } from "../lib/hooks/useEmployeeAppConfig";
import { useEmployeeSelfView } from "../lib/hooks/useEmployeeSelfView";
import { useNow } from "../lib/hooks/useNow";
import { formatClockTime, siteLabel } from "../lib/employeeHome";
import ScreenHeader from "../components/ScreenHeader";
import PinPad from "../components/employee/PinPad";
import PunchCamera from "../components/employee/PunchCamera";
import PunchConfirmation from "../components/employee/PunchConfirmation";
import Spinner from "../components/Spinner";
import Building2Icon from "../components/icons/Building2Icon";

const TITLES = { in: "Clock In", out: "Clock Out" };
const DONE_TITLES = { in: "Clocked in", out: "Clocked out" };

// Employee App clock in / out: PIN -> the server checks it (a wrong PIN or
// the lock shows here, before any photo) -> live front-camera photo (retake
// allowed) -> sent to employeeClockPunch -> green confirmation. Every error
// message is the server's own plain message, or "No signal".
export default function ClockPunchScreen({ route, navigation }) {
  const action = route.params?.action === "out" ? "out" : "in";
  const { userData, linkedEmployeeId } = useAuth();
  const { colors } = useTheme();
  const { timezone, companyName } = useEmployeeAppConfig(userData?.companyId);
  const employeeId = linkedEmployeeId || userData?.employeeId;
  const { view } = useEmployeeSelfView(userData?.companyId, employeeId);
  // The employee's subcontractor company if they have one, otherwise the
  // company that created them.
  const company = view?.subcontractorName || companyName;
  const flow = useClockPunch({
    action,
    companyId: userData?.companyId,
    employeeId,
  });
  const now = useNow(1000);
  const lockSeconds = flow.lockedUntil > now ? Math.ceil((flow.lockedUntil - now) / 1000) : 0;
  const close = useCallback(() => navigation.goBack(), [navigation]);

  if (flow.step === "camera") {
    return <PunchCamera onUse={flow.submitPhoto} onCancel={close} />;
  }

  if (flow.step === "done" && flow.result) {
    return (
      <PunchConfirmation
        title={DONE_TITLES[flow.result.type] ?? TITLES[action]}
        timeLabel={formatClockTime(flow.result.timestampMs, timezone)}
        siteName={siteLabel(flow.result.siteName)}
        photoUri={flow.photoUri}
        onClose={close}
      />
    );
  }

  const lockedMessage = lockSeconds > 0 ? `Too many wrong PINs. Try again in ${lockSeconds} second${lockSeconds === 1 ? "" : "s"}.` : "";
  // While a lock applies, only the live countdown shows (never a stale one).
  const message = flow.lockedUntil > 0 ? lockedMessage : flow.error;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title={TITLES[action]} onBack={flow.step === "sending" ? undefined : close} />
      <View style={styles.content}>
        {flow.step === "sending" ? (
          <View style={styles.center}>
            <Spinner size={32} color={colors.accent} />
            <Text style={[styles.sending, { color: colors.subtext }]}>{action === "in" ? "Clocking in..." : "Clocking out..."}</Text>
          </View>
        ) : null}

        {flow.step === "checking" ? (
          <View style={styles.center}>
            <Spinner size={32} color={colors.accent} />
            <Text style={[styles.sending, { color: colors.subtext }]}>Checking PIN...</Text>
          </View>
        ) : null}

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

        {message && flow.step !== "sending" && flow.step !== "checking" ? <Text style={[styles.error, { color: colors.red }]}>{message}</Text> : null}

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
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { alignItems: "center", paddingTop: 24, paddingHorizontal: 24 },
  center: { alignItems: "center", marginTop: 60 },
  sending: { marginTop: 12, fontSize: 15 },
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
