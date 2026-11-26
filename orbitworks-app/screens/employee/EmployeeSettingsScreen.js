import { useCallback } from "react";
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
import { useSavedPin } from "../../lib/hooks/useSavedPin";
import { usePunchQueue } from "../../lib/hooks/usePunchQueue";
import { useNow } from "../../lib/hooks/useNow";
import { formatWhen } from "../../lib/punchQueueLogic";
import { deleteAccountUrl, settingsRows } from "../../lib/employeeSettings";
import { getJoinLinks } from "../../lib/pendingJoin";
import { savedPinText } from "../../lib/savedPin";
import TabPage from "../../components/ui/TabPage";
import ListRow from "../../components/ui/ListRow";
import Avatar from "../../components/Avatar";
import DevPunchTimings from "../../components/employee/DevPunchTimings";
import { signOutEmployee } from "../../lib/employeeSignOut";
import LogoutUnsentModal from "../../components/LogoutUnsentModal";
import { useLogoutUnsent } from "../../lib/hooks/useLogoutUnsent";
import { countEmployeeUnsent } from "../../lib/roleQueues";
import { syncPunchQueue } from "../../lib/punchQueueSync";
import { unsentMessage } from "../../lib/queueOwnerLogic";

// Employee App Settings tab (Phase 5, decisions 14-20; Phase 10 A1). View
// only: photo, name, the email they signed in with, PIN (shown plainly
// from the copy saved on the phone - useSavedPin, D1 revised 2026-11-06;
// "Connect to the internet once..." until one is saved), birthday ("Not set") and the company the account is under (the
// parent company, never the subcontractor) - from useEmployeeSettingsData,
// saved on the phone for offline. No job site and no Location access row
// (D3 a: the Home banner says when location or Always is off). Switches:
// Dark mode (same saved setting as the supervisor app), Notifications and
// Location - the phone's own permission is the switch (no push token);
// turning one off opens the phone's Settings app. Then Last synced, App
// version, Update (OTA id or Built-in), dev punch timings (dev builds only)
// and Log out - with a warning when punches or comments are still waiting
// on the phone (they stay, and sync only when this employee signs back in).
// Logout fix (2026-11-21): the warning is LogoutUnsentModal - "N punches
// haven't sent yet", Send now (then logs out if all went) or Log out
// anyway; never deletes anything.
// Last, Delete account (Apple 5.1.1(v)): only a link - it opens the
// website's /delete-account page in the browser, where the employee signs
// in and confirms. Nothing is deleted from inside the app (cleanup 11/26).
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
  const savedPin = useSavedPin(companyId, employeeId);
  const queue = usePunchQueue(companyId, employeeId);
  const now = useNow(60000);
  const version = Constants.expoConfig?.version ?? "";
  const lastSynced = queue.lastSyncedMs ? formatWhen(queue.lastSyncedMs, now, timezone) : "Never";

  // On (Phase 6): the phone's prompt if never asked, else the phone's
  // Settings - same as the Home banner. Off - only the phone's Settings app.
  const setLocation = (on) => {
    if (on) location.fixPermission();
    else if (location.granted) Linking.openSettings();
  };
  const rows = settingsRows(info, savedPin.loaded ? savedPinText(savedPin.record, { loading: savedPin.fetching }) : "");
  const toggles = [
    ["Dark mode", isDark, toggleTheme],
    ["Notifications", notifications.granted, notifications.setEnabled],
    ["Location", location.granted, setLocation],
  ];
  // Log out: PIN check value, push token (Phase 7) and break reminders
  // first, each capped at 3 s - then always signs out (lib/employeeSignOut.js).
  const logOut = useCallback(
    () => signOutEmployee({ companyId, employeeId, signOutUser }),
    [companyId, employeeId, signOutUser]
  );
  // Everything still on the phone, even saved a second ago (no badge
  // delay), read fresh when Log out is tapped.
  const countNow = useCallback(() => countEmployeeUnsent(companyId, employeeId), [companyId, employeeId]);
  const sendNow = useCallback(() => syncPunchQueue(companyId, employeeId), [companyId, employeeId]);
  const unsent = useLogoutUnsent({ countNow, sendNow, logOut });
  const onLogout = () => unsent.start();

  const onDeleteAccount = () => {
    Linking.openURL(deleteAccountUrl(getJoinLinks())).catch(() => {});
  };

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

      <View style={styles.section}>
        <ListRow
          divider={false}
          onPress={onDeleteAccount}
          accessibilityLabel="Delete account"
          right={<Feather name="external-link" size={20} color={colors.redStrong} />}
        >
          <Text style={styles.logout}>Delete account</Text>
        </ListRow>
      </View>

      <LogoutUnsentModal
        visible={unsent.open}
        title={unsent.title}
        message={unsentMessage("employee")}
        note={unsent.note}
        sending={unsent.sending}
        onSendNow={unsent.send}
        onLogOut={unsent.logOutAnyway}
        onCancel={unsent.cancel}
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
