import { useCallback, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../lib/firebase";
import { useTheme } from "../../lib/ThemeContext";
import { useKioskPinPad } from "../../lib/hooks/useKioskPinPad";
import { useKioskIdle } from "../../lib/hooks/useKioskIdle";
import { lookupKioskUnlocker } from "../../lib/kioskPinStore";
import { isOnline } from "../../lib/employeeClockApi";
import PinPad from "../../components/employee/PinPad";

// Task 5 (K17) - the way into Kiosk Settings: an admin's OWN PIN (admins
// with Settings or Full access; checked on the iPad, works offline) OR the
// 10-minute exit key made in the website's Settings (checked by the server,
// single use). Employees' PINs never open it. Wrong tries count toward the
// tablet's 45 s wait.

const unlockFn = httpsCallable(functions, "checkKioskUnlock", { timeout: 15000 });

export default function KioskUnlockScreen({ navigation }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState("");
  const touch = useKioskIdle(navigation, 30000);

  const onFull = useCallback(
    async (code) => {
      touch();
      setMessage("");
      if (await lookupKioskUnlocker(code)) {
        navigation.replace("KioskSettings");
        return true;
      }
      if (!(await isOnline())) {
        setMessage("Offline: use an admin's own PIN, or connect to use an exit key.");
        return null;
      }
      try {
        await unlockFn({ code });
        navigation.replace("KioskSettings");
        return true;
      } catch (err) {
        const reason = err && err.details && err.details.reason;
        if (reason === "wrongKey" || reason === "locked") {
          setMessage(err.message || "That didn't work.");
          return false;
        }
        setMessage("Couldn't check the key. Try again.");
        return null;
      }
    },
    [navigation, touch]
  );
  const pad = useKioskPinPad(onFull);

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 16 }]} onTouchStart={touch}>
      <TouchableOpacity onPress={() => navigation.popToTop()} style={styles.topBack} accessibilityLabel="Back">
        <Feather name="chevron-left" size={28} color={colors.text} />
        <Text style={[styles.backText, { color: colors.text }]}>Back</Text>
      </TouchableOpacity>
      <View style={styles.center}>
        <Text style={[styles.title, { color: colors.text }]}>Kiosk settings</Text>
        <Text style={[styles.sub, { color: colors.subtext }]}>Admin PIN or exit key</Text>
        <PinPad length={pad.pin.length} onDigit={pad.onDigit} onDelete={pad.onDelete} disabled={pad.locked || pad.checking} />
        {pad.locked ? (
          <Text style={[styles.error, { color: colors.red }]}>Too many wrong tries. Try again in {pad.lockLeft} s.</Text>
        ) : message ? (
          <Text style={[styles.error, { color: colors.red }]}>{message}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 24 },
  topBack: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start" },
  backText: { fontSize: 17, fontWeight: "600" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  title: { fontSize: 24, fontWeight: "700" },
  sub: { fontSize: 15, marginBottom: 8 },
  error: { marginTop: 8, fontSize: 15, fontWeight: "600", textAlign: "center" },
});
