import { useState } from "react";
import { View, Text, Switch, StyleSheet, Linking } from "react-native";
import { Feather } from "@expo/vector-icons";
import Constants from "expo-constants";
import { useAuth } from "../../lib/AuthContext";
import { spacing, fontSizes } from "../../lib/theme";
import { useTheme } from "../../lib/ThemeContext";
import { makeStyles } from "../../lib/makeStyles";
import { useEmployeeAppConfig } from "../../lib/hooks/useEmployeeAppConfig";
import { useEmployeeSettingsData } from "../../lib/hooks/useEmployeeSettingsData";
import { useNotificationPermission } from "../../lib/hooks/useNotificationPermission";
import { useLocationPermission } from "../../lib/hooks/useLocationPermission";
import { usePunchQueue } from "../../lib/hooks/usePunchQueue";
import { useCommentQueue } from "../../lib/hooks/useCommentQueue";
import { useNow } from "../../lib/hooks/useNow";
import { formatWhen } from "../../lib/punchQueueLogic";
import { logoutCounts, logoutWarning, settingsRows } from "../../lib/employeeSettings";
import TabPage from "../../components/ui/TabPage";
import ListRow from "../../components/ui/ListRow";
import ConfirmModal from "../../components/ui/ConfirmModal";
import Avatar from "../../components/Avatar";
import DevPunchTimings from "../../components/employee/DevPunchTimings";
import { forgetPinVerifier } from "../../lib/pinCheck";

// Employee App Settings tab (Phase 5, decisions 14-20). View only: photo,
// name, email (the login's when the self view has none), PIN ****,
// birthday ("Not set"), company, subcontractor ("None") and job site - all
// from useEmployeeSettingsData, saved on the phone for offline. Switches:
// Dark mode (same saved setting as the supervisor app), Notifications and
// Location - the phone's own permission is the switch (no push token);
// turning one off opens the phone's Settings app. Then Last synced, App
// version, Update (OTA id or Built-in), dev punch timings (dev builds only)
// and Log out - with a warning when punches or comments are still waiting
// on the phone (they stay, and sync only when this employee signs back in).
export default function EmployeeSettingsScreen() {
  const { colors, isDark, toggleTheme } = useTheme();
  const styles = useStyles();
  const { signOutUser, userData, linkedEmployeeId } = useAuth();
  const companyId = userData?.companyId;
  const employeeId = linkedEmployeeId || userData?.employeeId;
  const { timezone } = useEmployeeAppConfig(companyId);
  const { info } = useEmployeeSettingsData(companyId, employeeId);
  const notifications = useNotificationPermission();
  const location = useLocationPermission();
  const queue = usePunchQueue(companyId, employeeId);
  const comments = useCommentQueue(companyId, employeeId, timezone);
  const now = useNow(60000);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const version = Constants.expoConfig?.version ?? "";
  const lastSynced = queue.lastSyncedMs ? formatWhen(queue.lastSyncedMs, now, timezone) : "Never";

  // On (Phase 6): the phone's prompt if never asked, else the phone's
  // Settings - same as the Home banner. Off - only the phone's Settings app.
  const setLocation = (on) => {
    if (on) location.fixPermission();
    else if (location.granted) Linking.openSettings();
  };
  const rows = settingsRows(info);
  const toggles = [
    ["Dark mode", isDark, toggleTheme],
    ["Notifications", notifications.granted, notifications.setEnabled],
    ["Location", location.granted, setLocation],
  ];
  // Log out drops this phone's PIN check value first (lib/pinCheck.js).
  const logOut = () => forgetPinVerifier(companyId, employeeId).finally(signOutUser);
  // Everything still on the phone, even saved a second ago (no badge delay).
  const waiting = logoutCounts(queue.all, comments.all, companyId, employeeId);
  const notSynced = logoutWarning(waiting.punches, waiting.comments);
  const onLogout = () => (notSynced ? setConfirmLogout(true) : logOut());

  return (
    <TabPage title="Settings">
      <View style={styles.profile}>
        <Avatar name={info.name} photoUrl={info.photoUrl} size={64} />
        <Text style={styles.name} numberOfLines={2}>
          {info.name}
        </Text>
      </View>

      <View style={styles.section}>
        {rows.map(([label, value], i) => (
          <ListRow key={label} divider={i < rows.length - 1}>
            <Text style={styles.label}>{label}</Text>
            <Text style={styles.value}>{value}</Text>
          </ListRow>
        ))}
      </View>

      <View style={styles.section}>
        {toggles.map(([label, on, setOn], i) => (
          <ListRow
            key={label}
            divider={i < toggles.length - 1}
            right={
              <Switch
                value={on}
                onValueChange={setOn}
                trackColor={{ false: colors.border, true: colors.accent }}
                ios_backgroundColor={colors.border}
                accessibilityLabel={label}
              />
            }
          >
            <Text style={styles.rowText}>{label}</Text>
          </ListRow>
        ))}
      </View>

      <View style={styles.section}>
        <ListRow right={<Text style={styles.rightText}>{lastSynced}</Text>}>
          <Text style={styles.rowText}>Last synced</Text>
        </ListRow>
        <ListRow right={<Text style={styles.rightText}>{version}</Text>}>
          <Text style={styles.rowText}>App version</Text>
        </ListRow>
        <ListRow divider={false} right={<Text style={styles.rightText}>{info.update}</Text>}>
          <Text style={styles.rowText}>Update</Text>
        </ListRow>
      </View>

      <DevPunchTimings />

      <View style={styles.section}>
        <ListRow
          divider={false}
          onPress={onLogout}
          accessibilityLabel="Log out"
          right={<Feather name="log-out" size={20} color={colors.redStrong} />}
        >
          <Text style={styles.logout}>Log out</Text>
        </ListRow>
      </View>

      <ConfirmModal
        visible={confirmLogout}
        title={notSynced}
        message="They stay on this phone and sync only when you sign back in on it."
        confirmLabel="Log out"
        confirmTone="red"
        cancelLabel="Stay signed in"
        onConfirm={() => {
          setConfirmLogout(false);
          logOut();
        }}
        onCancel={() => setConfirmLogout(false)}
      />
    </TabPage>
  );
}

const useStyles = makeStyles((colors) => ({
  profile: { alignItems: "center", gap: spacing.md, marginBottom: spacing.xxl },
  name: { fontSize: fontSizes.xl, fontWeight: "700", color: colors.text, textAlign: "center" },
  section: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginBottom: spacing.xxl,
  },
  label: { fontSize: fontSizes.xs, color: colors.subtext },
  value: { fontSize: fontSizes.md, color: colors.text, marginTop: 2 },
  rowText: { fontSize: fontSizes.md, color: colors.text },
  rightText: { fontSize: fontSizes.sm, color: colors.subtext },
  logout: { fontSize: fontSizes.md, fontWeight: "600", color: colors.redStrong },
}));
