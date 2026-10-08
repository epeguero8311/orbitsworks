import { useState, useEffect, useCallback } from "react";
import { View, Text, Switch, TouchableOpacity, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import Constants from "expo-constants";
import { signOut } from "firebase/auth";
import { auth } from "../lib/firebase";
import { useAuth } from "../lib/AuthContext";
import { useTheme } from "../lib/ThemeContext";
import { useCompanySettings } from "../lib/hooks/useCompanySettings";
import { getLastSyncTime } from "../lib/queueSync";
import { subscribeQueueChange } from "../lib/queueEvents";
import { getNotificationState, setNotificationsEnabled, registerForPushNotificationsAsync } from "../lib/pushNotifications";
import ScreenHeader from "../components/ScreenHeader";
import DeviceNameRow from "../components/DeviceNameRow";

const APP_VERSION = Constants.expoConfig?.version ?? "-";

function formatLastSync(ms) {
  if (!ms) return "Never";
  return new Date(ms).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function SettingsScreen() {
  const { currentUser, userData } = useAuth();
  const { colors, isDark, toggleTheme } = useTheme();
  const { isPro } = useCompanySettings(userData?.companyId);
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const companyId = userData?.companyId;

  useEffect(() => {
    if (!companyId) return;
    getNotificationState(companyId).then((state) => setNotifEnabled(state?.notificationsEnabled ?? false));
  }, [companyId]);

  const refreshLastSync = useCallback(() => {
    getLastSyncTime().then(setLastSync);
  }, []);

  useEffect(() => {
    refreshLastSync();
    return subscribeQueueChange(refreshLastSync);
  }, [refreshLastSync]);

  const handleToggleNotifications = async (value) => {
    setNotifEnabled(value);
    if (!companyId) return;

    if (value) {
      const state = await getNotificationState(companyId);
      if (!state) {
        // Never registered on this device yet - this runs permission
        // request + token registration (a no-op if already denied).
        await registerForPushNotificationsAsync(companyId);
        const after = await getNotificationState(companyId);
        setNotifEnabled(after?.notificationsEnabled ?? false);
        return;
      }
    }

    const ok = await setNotificationsEnabled(companyId, value);
    if (!ok) setNotifEnabled(!value);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Settings" />

      <View style={styles.content}>
        <Text style={[styles.sectionLabel, { color: colors.subtext }]}>Logged in as</Text>
        <Text style={[styles.email, { color: colors.text }]}>{currentUser?.email}</Text>

        <DeviceNameRow companyId={userData?.companyId} isPro={isPro} />

        <View style={[styles.row, { borderColor: colors.border }]}>
          <View style={styles.rowLeft}>
            <Feather name={isDark ? "moon" : "sun"} size={18} color={colors.text} />
            <Text style={[styles.rowLabel, { color: colors.text }]}>Dark mode</Text>
          </View>
          <Switch value={isDark} onValueChange={toggleTheme} trackColor={{ true: colors.accent }} />
        </View>

        <View style={[styles.row, { borderColor: colors.border }]}>
          <View style={styles.rowLeft}>
            <Feather name="bell" size={18} color={colors.text} />
            <Text style={[styles.rowLabel, { color: colors.text }]}>Notifications</Text>
          </View>
          <Switch value={notifEnabled} onValueChange={handleToggleNotifications} trackColor={{ true: colors.accent }} />
        </View>

        <View style={[styles.infoRow, { borderColor: colors.border }]}>
          <Text style={[styles.infoLabel, { color: colors.subtext }]}>Last synced</Text>
          <Text style={[styles.infoValue, { color: colors.text }]}>{formatLastSync(lastSync)}</Text>
        </View>

        <View style={[styles.infoRow, { borderColor: colors.border }]}>
          <Text style={[styles.infoLabel, { color: colors.subtext }]}>App version</Text>
          <Text style={[styles.infoValue, { color: colors.text }]}>{APP_VERSION}</Text>
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={() => signOut(auth)}>
          <Feather name="log-out" size={16} color="#ef4444" />
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 24 },
  sectionLabel: { fontSize: 13, marginBottom: 4 },
  email: { fontSize: 16, fontWeight: "600", marginBottom: 24 },
  row: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingVertical: 16, borderTopWidth: 1,
  },
  rowLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  rowLabel: { fontSize: 15, fontWeight: "500" },
  infoRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingVertical: 14, borderTopWidth: 1,
  },
  infoLabel: { fontSize: 14 },
  infoValue: { fontSize: 14, fontWeight: "500" },
  logoutButton: {
    marginTop: 32, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, padding: 14,
  },
  logoutText: { color: "#ef4444", fontSize: 15, fontWeight: "600" },
});
