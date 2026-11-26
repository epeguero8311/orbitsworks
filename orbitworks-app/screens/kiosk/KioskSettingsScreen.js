import { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, Switch, ScrollView, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import Constants from "expo-constants";
import * as Device from "expo-device";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../lib/firebase";
import { useAuth } from "../../lib/AuthContext";
import { useTheme } from "../../lib/ThemeContext";
import { useKiosk } from "../../lib/hooks/useKiosk";
import { useKioskIdle } from "../../lib/hooks/useKioskIdle";
import { forgetKioskTable } from "../../lib/kioskPinStore";
import { getCachedDeviceName, getOrCreateDeviceId, setCachedDeviceName } from "../../lib/deviceId";
import { getLocationPermissionStatus, openLocationSettings, requestLocationPermission } from "../../lib/locationPermission";
import ConfirmModal from "../../components/ui/ConfirmModal";
import Spinner from "../../components/Spinner";
import { agoText, kioskSyncRows } from "../../lib/kioskLogic";
import { useNow } from "../../lib/hooks/useNow";

// Task 5 (K17/K18) - Kiosk Settings, opened only with an admin's own PIN or
// a 10-minute exit key (KioskUnlockScreen). Logged in as | Device name
// (editable) | Dark mode | Location permission | Last synced | App version,
// plus Exit Kiosk - the only way out of Kiosk mode (no normal Log out).
// Exit is refused while punches are still waiting to send, so a punch is
// never lost. Closes itself back to Home after 2 minutes untouched.
// iPad round 1: under Exit Kiosk, a read-only "Waiting to sync" list (each
// punch not on the server yet: employee, action, punch time, Waiting /
// Sending / Failed + reason) with a Sync now button; "All synced, last
// synced X ago" when nothing waits. Nothing can be edited or removed here.

const APP_VERSION = Constants.expoConfig?.version ?? "-";
const renameFn = httpsCallable(functions, "renameKioskDevice", { timeout: 15000 });

function whenText(ms) {
  if (!ms) return "Never";
  return new Date(ms).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function KioskSettingsScreen({ navigation }) {
  const { colors, isDark, toggleTheme } = useTheme();
  const insets = useSafeAreaInsets();
  const { currentUser, signOutUser } = useAuth();
  const kiosk = useKiosk();
  const touch = useKioskIdle(navigation, 2 * 60 * 1000);
  const [deviceName, setDeviceName] = useState("");
  const [nameMsg, setNameMsg] = useState("");
  const [locStatus, setLocStatus] = useState(null);
  const [exitMsg, setExitMsg] = useState("");
  const [confirmExit, setConfirmExit] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const now = useNow(15000);
  const syncRows = kioskSyncRows(kiosk.items, now);

  useEffect(() => {
    getCachedDeviceName(kiosk.companyId).then((n) => setDeviceName(n || ""));
    getLocationPermissionStatus().then((s) => setLocStatus(s?.status ?? null)).catch(() => {});
  }, [kiosk.companyId]);

  async function saveName() {
    touch();
    const name = deviceName.trim();
    if (!name || name.length > 24) return setNameMsg("1 to 24 characters.");
    try {
      const deviceId = await getOrCreateDeviceId();
      const platform = Device.osName === "Android" ? "android" : "ios";
      await renameFn({ deviceId, name, platform, model: (Device.modelName || "").slice(0, 64) });
      await setCachedDeviceName(kiosk.companyId, name);
      setNameMsg("Saved.");
    } catch (err) {
      setNameMsg((err && err.message) || "Couldn't save. Try again.");
    }
  }

  async function fixLocation() {
    touch();
    if (locStatus === "denied") return openLocationSettings();
    const s = await requestLocationPermission().catch(() => null);
    setLocStatus(s?.status ?? (await getLocationPermissionStatus())?.status ?? null);
  }

  async function tryExit() {
    touch();
    setExitMsg("");
    if (kiosk.unsentCount > 0) {
      kiosk.sendNow();
      setExitMsg(`Connect to send ${kiosk.unsentCount} punch${kiosk.unsentCount === 1 ? "" : "es"} first.`);
      return;
    }
    setConfirmExit(true);
  }

  async function syncNow() {
    touch();
    if (syncing) return;
    setSyncing(true);
    try {
      await Promise.all([kiosk.sendNow(), kiosk.refreshTable().catch(() => {})]);
    } finally {
      setSyncing(false);
    }
  }

  async function exitKiosk() {
    setConfirmExit(false);
    if (currentUser) await forgetKioskTable(currentUser.uid);
    await signOutUser();
  }

  const row = (label, value) => (
    <View style={[styles.row, { borderColor: colors.border }]}>
      <Text style={[styles.label, { color: colors.subtext }]}>{label}</Text>
      {typeof value === "string" ? <Text style={[styles.value, { color: colors.text }]}>{value}</Text> : value}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 16 }]} onTouchStart={touch}>
      <TouchableOpacity onPress={() => navigation.popToTop()} style={styles.topBack} accessibilityLabel="Done">
        <Feather name="chevron-left" size={28} color={colors.text} />
        <Text style={[styles.back, { color: colors.text }]}>Done</Text>
      </TouchableOpacity>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, { color: colors.text }]}>Kiosk settings</Text>

        {row("Logged in as", `${kiosk.kioskName}${currentUser?.email ? ` (${currentUser.email})` : ""}`)}
        {row(
          "Device name",
          <View style={styles.nameBox}>
            <TextInput
              value={deviceName}
              onChangeText={(t) => {
                setDeviceName(t);
                setNameMsg("");
                touch();
              }}
              maxLength={24}
              placeholder="e.g. Front gate iPad"
              placeholderTextColor={colors.muted}
              style={[styles.input, { color: colors.text, borderColor: colors.border }]}
            />
            <TouchableOpacity onPress={saveName} style={[styles.small, { backgroundColor: colors.accent }]}>
              <Text style={styles.smallText}>Save</Text>
            </TouchableOpacity>
          </View>
        )}
        {nameMsg ? <Text style={[styles.note, { color: colors.subtext }]}>{nameMsg}</Text> : null}
        {row("Dark mode", <Switch value={isDark} onValueChange={() => { touch(); toggleTheme(); }} />)}
        {row(
          "Location",
          <TouchableOpacity onPress={locStatus === "granted" ? undefined : fixLocation} disabled={locStatus === "granted"}>
            <Text style={[styles.value, { color: locStatus === "granted" ? colors.greenText : colors.accent }]}>
              {locStatus === "granted" ? "Allowed" : locStatus === "denied" ? "Off - open Settings" : "Allow location"}
            </Text>
          </TouchableOpacity>
        )}
        {row("Last synced", whenText(kiosk.lastSyncedMs))}
        {row("App version", APP_VERSION)}

        <TouchableOpacity onPress={tryExit} style={[styles.exit, { borderColor: colors.redStrong }]}>
          <Feather name="log-out" size={18} color={colors.redStrong} />
          <Text style={[styles.exitText, { color: colors.redStrong }]}>Exit Kiosk</Text>
        </TouchableOpacity>
        {exitMsg ? <Text style={[styles.note, { color: colors.redStrong }]}>{exitMsg}</Text> : null}

        <View style={styles.syncHead}>
          <Text style={[styles.syncTitle, { color: colors.text }]}>Waiting to sync</Text>
          <TouchableOpacity
            onPress={syncNow}
            disabled={syncing}
            style={[styles.small, styles.syncButton, { backgroundColor: colors.accent }, syncing && styles.dim]}
            accessibilityRole="button"
            accessibilityLabel="Sync now"
          >
            {syncing ? <Spinner size={14} color="#fff" /> : <Feather name="refresh-cw" size={14} color="#fff" />}
            <Text style={styles.smallText}>{syncing ? "Syncing..." : "Sync now"}</Text>
          </TouchableOpacity>
        </View>
        {syncRows.length === 0 ? (
          <View style={[styles.allSynced, { backgroundColor: colors.greenSoft }]}>
            <Feather name="check-circle" size={16} color={colors.greenText} />
            <Text style={[styles.allSyncedText, { color: colors.greenText }]}>
              All synced, last synced {agoText(kiosk.lastSyncedMs, now)}
            </Text>
          </View>
        ) : (
          syncRows.map((r) => (
            <View key={r.requestId} style={[styles.syncRow, { borderColor: colors.border }]}>
              <View style={styles.syncMain}>
                <Text style={[styles.syncName, { color: colors.text }]} numberOfLines={1}>{r.employeeName}</Text>
                <Text style={[styles.syncSub, { color: colors.subtext }]}>
                  {r.actionText} - {whenText(r.queuedAtMs)}
                </Text>
                {r.reason ? <Text style={[styles.syncReason, { color: colors.redStrong }]}>{r.reason}</Text> : null}
              </View>
              <View
                style={[
                  styles.badge,
                  { backgroundColor: r.status === "failed" ? "rgba(220,38,38,0.14)" : r.status === "syncing" ? colors.accentSoft : colors.orangeSoft },
                ]}
              >
                <Text
                  style={[
                    styles.badgeText,
                    { color: r.status === "failed" ? colors.redStrong : r.status === "syncing" ? colors.accent : colors.orangeText },
                  ]}
                >
                  {r.statusText}
                </Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <ConfirmModal
        visible={confirmExit}
        title="Exit Kiosk mode?"
        message="This iPad signs out of the kiosk login. Sign in again with it to turn Kiosk mode back on."
        confirmLabel="Exit Kiosk"
        cancelLabel="Cancel"
        onConfirm={exitKiosk}
        onCancel={() => setConfirmExit(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 24 },
  topBack: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start" },
  back: { fontSize: 17, fontWeight: "600" },
  scroll: { paddingVertical: 16, maxWidth: 640, width: "100%", alignSelf: "center" },
  title: { fontSize: 26, fontWeight: "700", marginBottom: 12 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14, borderBottomWidth: 1, gap: 12 },
  label: { fontSize: 15 },
  value: { fontSize: 15, fontWeight: "600", flexShrink: 1, textAlign: "right" },
  nameBox: { flexDirection: "row", alignItems: "center", gap: 8 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, minWidth: 180, fontSize: 15 },
  small: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  smallText: { color: "#fff", fontWeight: "700" },
  note: { fontSize: 13, marginTop: 6 },
  dim: { opacity: 0.6 },
  syncHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 32, marginBottom: 8 },
  syncTitle: { fontSize: 18, fontWeight: "700" },
  syncButton: { flexDirection: "row", alignItems: "center", gap: 6 },
  allSynced: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 10, padding: 12 },
  allSyncedText: { fontSize: 15, fontWeight: "600" },
  syncRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: 1, gap: 12 },
  syncMain: { flex: 1 },
  syncName: { fontSize: 16, fontWeight: "600" },
  syncSub: { fontSize: 14, marginTop: 2 },
  syncReason: { fontSize: 13, marginTop: 4 },
  badge: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 13, fontWeight: "700" },
  exit: { marginTop: 32, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderRadius: 12, paddingVertical: 14 },
  exitText: { fontSize: 17, fontWeight: "700" },
});
