import { useState } from "react";
import { View, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import * as Sentry from "@sentry/react-native";
import { useAuth } from "../../lib/AuthContext";
import { lightColors as colors, spacing } from "../../lib/theme";
import { findEmployeeByPin } from "../../lib/clockLogic";
import BackBar from "../../components/ui/BackBar";
import PinPad from "../../components/ui/PinPad";

// Identifies who is authorizing a break action, not who is going on break -
// the target employees are picked from a list on the next screen. This PIN
// exists so every break event records who was responsible for it. Only
// supervisors can authorize - same restriction as Supervisor Override.
export default function BreaksPinEntryScreen({ navigation }) {
  const { userData } = useAuth();
  const insets = useSafeAreaInsets();
  const [pin, setPin] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  const handleKeyPress = async (key) => {
    if (checking) return;
    setError("");

    if (key === "del") {
      setPin((p) => p.slice(0, -1));
      return;
    }
    if (key === "") return;

    Haptics.selectionAsync();

    const next = pin + key;
    setPin(next);

    if (next.length === 4) {
      setChecking(true);
      try {
        const employee = await findEmployeeByPin(userData.companyId, next);

        if (!employee) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          setError("PIN not recognized");
          setPin("");
          return;
        }

        if (!employee.isSupervisor) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          setError("Only supervisors can manage breaks");
          setPin("");
          return;
        }

        // findEmployeeByPin now also resolves an inactive employee who still
        // has an open session, purely so THEY can be clocked out - a
        // deactivated supervisor must never be able to use that same PIN
        // match to authorize breaks for someone else.
        if (!employee.active) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          setError("This supervisor account is no longer active");
          setPin("");
          return;
        }

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        navigation.replace("BreaksEmployeeList", { authorizedBy: employee });
        setPin("");
      } catch (err) {
        // Previously unhandled - left `checking` stuck true forever with
        // no error shown. The lockout throw from findEmployeeByPin is
        // expected/user-facing, not a bug, so it's shown but not reported.
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setError(err.message || "Something went wrong. Try again.");
        setPin("");
        if (!err.message?.startsWith("Too many attempts")) {
          Sentry.captureException(err, {
            tags: { area: "breaksPinEntry" },
            contexts: { clockAttempt: { companyId: userData?.companyId } },
          });
        }
      } finally {
        setChecking(false);
      }
    }
  };

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom + spacing.lg }]}>
      <BackBar title="Breaks" onBack={() => navigation.goBack()} />
      <PinPad
        title="Enter your PIN"
        subtitle="This identifies who is authorizing the break"
        length={pin.length}
        onDigit={handleKeyPress}
        onDelete={() => handleKeyPress("del")}
        busy={checking}
        message={error}
        shakeKey={error}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
});
