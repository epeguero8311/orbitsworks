import { useCallback } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useAuth } from "../lib/AuthContext";
import { lightColors as colors } from "../lib/theme";
import { useClockPunch } from "../lib/hooks/useClockPunch";
import { useEmployeeAppConfig } from "../lib/hooks/useEmployeeAppConfig";
import { useNow } from "../lib/hooks/useNow";
import { formatClockTime, siteLabel } from "../lib/employeeHome";
import BackBar from "../components/ui/BackBar";
import PinPad from "../components/ui/PinPad";
import PunchCamera from "../components/employee/PunchCamera";
import PunchConfirmation from "../components/employee/PunchConfirmation";
import Spinner from "../components/Spinner";

const TITLES = { in: "Clock In", out: "Clock Out" };
const DONE_TITLES = { in: "Clocked in", out: "Clocked out" };

// Employee App clock in / out: PIN -> the server checks it (a wrong PIN or
// the lock shows here, before any photo) -> live front-camera photo (retake
// allowed) -> sent to employeeClockPunch -> green confirmation. Every error
// message is the server's own plain message, or "No signal".
export default function ClockPunchScreen({ route, navigation }) {
  const action = route.params?.action === "out" ? "out" : "in";
  const { userData, linkedEmployeeId } = useAuth();
  const { timezone } = useEmployeeAppConfig(userData?.companyId);
  const flow = useClockPunch({
    action,
    companyId: userData?.companyId,
    employeeId: linkedEmployeeId || userData?.employeeId,
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
  // The pad stays up while the PIN is checked, so a wrong PIN can shake it.
  const onPad = flow.step === "pin" || flow.step === "checking";

  return (
    <View style={styles.container}>
      <BackBar title={TITLES[action]} onBack={flow.step === "sending" ? undefined : close} />
      {onPad ? (
        <PinPad
          title="Enter your PIN"
          length={flow.pin.length}
          onDigit={flow.pressDigit}
          onDelete={flow.deleteDigit}
          disabled={lockSeconds > 0 || flow.step === "checking"}
          busy={flow.step === "checking"}
          busyLabel="Checking PIN..."
          message={message}
          shakeKey={flow.error}
        />
      ) : (
        <View style={styles.content}>
          {flow.step === "sending" ? (
            <View style={styles.center}>
              <Spinner size={32} color={colors.accent} />
              <Text style={styles.sending}>{action === "in" ? "Clocking in..." : "Clocking out..."}</Text>
            </View>
          ) : null}

          {message && flow.step !== "sending" ? <Text style={styles.error}>{message}</Text> : null}

          {flow.step === "retry" ? (
            <TouchableOpacity style={styles.button} onPress={flow.retry}>
              <Text style={styles.buttonText}>Try again</Text>
            </TouchableOpacity>
          ) : null}
          {flow.step === "failed" || flow.step === "retry" ? (
            <TouchableOpacity style={styles.link} onPress={close}>
              <Text style={styles.linkText}>Back to Home</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { alignItems: "center", paddingTop: 24, paddingHorizontal: 24 },
  center: { alignItems: "center", marginTop: 60 },
  sending: { marginTop: 12, fontSize: 15, color: colors.subtext },
  error: { marginTop: 16, fontSize: 15, textAlign: "center", color: colors.red },
  button: { marginTop: 24, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 40, backgroundColor: colors.accent },
  buttonText: { color: colors.onColor, fontSize: 16, fontWeight: "700" },
  link: { marginTop: 16, padding: 8 },
  linkText: { fontSize: 15, fontWeight: "600", color: colors.accent },
});
