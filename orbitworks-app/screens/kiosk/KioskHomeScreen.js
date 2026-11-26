import { useCallback, useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTheme } from "../../lib/ThemeContext";
import { useKiosk } from "../../lib/hooks/useKiosk";
import { useKioskPinPad } from "../../lib/hooks/useKioskPinPad";
import { useIsOffline } from "../../lib/hooks/useIsOffline";
import { lookupKioskPin } from "../../lib/kioskPinStore";
import PinPad from "../../components/employee/PinPad";
import { KIOSK_PAD_SCALE } from "../../lib/kioskLayout";
import Spinner from "../../components/Spinner";
import { useTabletLayout } from "../../lib/hooks/useTabletLayout";

// Task 5 Kiosk mode - Home. The wall iPad's resting screen: the time, the
// PIN pad, and a gear for Kiosk Settings (admin PIN or exit key only).
// No employee list, Reports, override, Alerts or Log out here (spec).
// Every action needs a PIN; the PIN is checked on the iPad against salted
// hashes (works offline) and again by the server when the punch is sent.

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(t);
  }, []);
  return now;
}

const BLOCKED_TEXT = {
  inactive: "This kiosk was turned off. Ask your admin.",
  notKiosk: "This login isn't a kiosk any more. Ask your admin.",
  kioskOff: "Kiosk mode isn't available yet.",
};

export default function KioskHomeScreen({ navigation }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const kiosk = useKiosk();
  const offline = useIsOffline();
  const now = useClock();
  const [message, setMessage] = useState("");
  const { grid } = useTabletLayout();

  // Coming back to Home = a natural moment to pick up PIN changes.
  useFocusEffect(
    useCallback(() => {
      kiosk.refreshTable();
      setMessage("");
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  const onFull = useCallback(
    async (pin) => {
      const employee = await lookupKioskPin(pin);
      if (!employee) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        setMessage("PIN not recognized");
        return false;
      }
      Haptics.selectionAsync().catch(() => {});
      setMessage("");
      navigation.navigate("KioskAction", { employeeId: employee.id, pin });
      return true;
    },
    [navigation]
  );
  const pad = useKioskPinPad(onFull);

  const blockedReason = kiosk.tableStatus.reason;
  const noTable = !kiosk.table;
  const notPro = kiosk.table && !kiosk.isPro;

  let body;
  if (blockedReason) {
    body = <Text style={[styles.notice, { color: colors.text }]}>{BLOCKED_TEXT[blockedReason]}</Text>;
  } else if (noTable) {
    body = (
      <View style={styles.center}>
        <Spinner size={24} color={colors.accent} />
        <Text style={[styles.sub, { color: colors.subtext }]}>
          {offline ? "Connect this iPad to the internet once to load your team." : "Loading your team..."}
        </Text>
      </View>
    );
  } else if (notPro) {
    body = <Text style={[styles.notice, { color: colors.text }]}>Kiosk needs Pro - ask your admin</Text>;
  } else {
    body = (
      <View style={styles.center}>
        <Text style={[styles.title, { color: colors.text }]}>Enter your PIN</Text>
        <PinPad length={pad.pin.length} onDigit={pad.onDigit} onDelete={pad.onDelete} disabled={pad.locked || pad.checking} scale={KIOSK_PAD_SCALE} />
        {pad.locked ? (
          <Text style={[styles.error, { color: colors.red }]}>Too many wrong PINs. Try again in {pad.lockLeft} s.</Text>
        ) : message ? (
          <Text style={[styles.error, { color: colors.red }]}>{message}</Text>
        ) : null}
      </View>
    );
  }

  const gear = (
    <TouchableOpacity
      onPress={() => navigation.navigate("KioskUnlock")}
      accessibilityLabel="Kiosk settings"
      style={[styles.gear, { borderColor: colors.border }]}
    >
      <Feather name="settings" size={22} color={colors.subtext} />
    </TouchableOpacity>
  );
  const pill =
    offline || kiosk.unsentCount > 0 ? (
      <View style={[styles.pill, { backgroundColor: colors.orangeSoft }]}>
        <Feather name={offline ? "wifi-off" : "upload-cloud"} size={14} color={colors.orangeText} />
        <Text style={[styles.pillText, { color: colors.orangeText }]}>
          {offline ? "Offline - punches are saved and sent later" : `Sending ${kiosk.unsentCount} punch${kiosk.unsentCount === 1 ? "" : "es"}...`}
        </Text>
      </View>
    ) : null;
  const dateText = now.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
  const timeText = now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  // Task 7: a tablet on its side - the clock on the left, the PIN pad on the
  // right (lib/tabletLayout.js). Portrait / Split View: stacked as before.
  if (grid) {
    return (
      <View style={[styles.container, styles.wide, { backgroundColor: colors.background, paddingTop: insets.top + 12 }]}>
        <View style={styles.wideLeft}>
          <Text style={[styles.wideName, { color: colors.text }]} numberOfLines={2}>{kiosk.kioskName}</Text>
          <Text style={[styles.wideTime, { color: colors.text }]}>{timeText}</Text>
          <Text style={[styles.wideDate, { color: colors.subtext }]}>{dateText}</Text>
          <View style={styles.widePill}>{pill}</View>
        </View>
        <View style={styles.wideRight}>{body}</View>
        <View style={[styles.wideGear, { top: insets.top + 12 }]}>{gear}</View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 12 }]}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.kioskName, { color: colors.text }]} numberOfLines={1}>{kiosk.kioskName}</Text>
          <Text style={[styles.sub, { color: colors.subtext }]}>{dateText}</Text>
        </View>
        <Text style={[styles.time, { color: colors.text }]}>{timeText}</Text>
        {gear}
      </View>

      {pill}

      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 24 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16 },
  kioskName: { fontSize: 20, fontWeight: "700", maxWidth: 260 },
  time: { fontSize: 34, fontWeight: "700" },
  gear: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  pill: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "center", paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, marginTop: 16 },
  pillText: { fontSize: 13, fontWeight: "600" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  title: { fontSize: 24, fontWeight: "700", marginBottom: 8 },
  sub: { fontSize: 14, marginTop: 2, textAlign: "center" },
  notice: { flex: 1, textAlign: "center", textAlignVertical: "center", fontSize: 20, fontWeight: "600", marginTop: 120 },
  error: { marginTop: 8, fontSize: 15, fontWeight: "600" },
  wide: { flexDirection: "row", paddingHorizontal: 48, gap: 48 },
  wideLeft: { flex: 1, justifyContent: "center", gap: 8 },
  wideRight: { flex: 1, justifyContent: "center" },
  wideName: { fontSize: 28, fontWeight: "700" },
  wideTime: { fontSize: 88, fontWeight: "800", fontVariant: ["tabular-nums"] },
  wideDate: { fontSize: 22 },
  wideGear: { position: "absolute", right: 24 },
  widePill: { alignSelf: "flex-start" },
});
