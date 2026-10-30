import { useState } from "react";
import { View, Text, Switch, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import Constants from "expo-constants";
import { useAuth } from "../../lib/AuthContext";
import { spacing, fontSizes } from "../../lib/theme";
import { useTheme } from "../../lib/ThemeContext";
import { makeStyles } from "../../lib/makeStyles";
import { MOCK_SETTINGS } from "../../lib/mockData";
import { useEmployeeAppConfig } from "../../lib/hooks/useEmployeeAppConfig";
import { usePunchQueue } from "../../lib/hooks/usePunchQueue";
import { useNow } from "../../lib/hooks/useNow";
import { formatWhen } from "../../lib/punchQueueLogic";
import TabPage from "../../components/ui/TabPage";
import ListRow from "../../components/ui/ListRow";
import ConfirmModal from "../../components/ui/ConfirmModal";
import DevPunchTimings from "../../components/employee/DevPunchTimings";

// The PIN itself is never kept on the phone for display.
const PIN_MASK = "****";

// Employee App Settings tab. Real: Last synced (when the server last
// accepted a punch from this phone), Dark mode (same saved setting as the
// supervisor app), the app version and Log out - with a warning when
// punches are still waiting on the phone (they stay, and sync only when
// this employee signs back in). Still mock until Phase 5 (lib/mockData.js):
// email, birthday and the Notifications / Location switches.
export default function EmployeeSettingsScreen() {
  const { colors, isDark, toggleTheme } = useTheme();
  const styles = useStyles();
  const { signOutUser, userData, linkedEmployeeId } = useAuth();
  const companyId = userData?.companyId;
  const employeeId = linkedEmployeeId || userData?.employeeId;
  const { timezone } = useEmployeeAppConfig(companyId);
  const queue = usePunchQueue(companyId, employeeId);
  const now = useNow(60000);
  const [notifications, setNotifications] = useState(MOCK_SETTINGS.notifications);
  const [location, setLocation] = useState(MOCK_SETTINGS.location);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const version = Constants.expoConfig?.version ?? "";
  const lastSynced = queue.lastSyncedMs ? formatWhen(queue.lastSyncedMs, now, timezone) : "Never";

  const info = [
    ["Logged in as", MOCK_SETTINGS.email],
    ["PIN", PIN_MASK],
    ["Birthday", MOCK_SETTINGS.birthday],
  ];
  const toggles = [
    ["Dark mode", isDark, toggleTheme],
    ["Notifications", notifications, setNotifications],
    ["Location", location, setLocation],
  ];
  const onLogout = () => (queue.badge > 0 ? setConfirmLogout(true) : signOutUser());
  const notSynced = `${queue.badge} punch${queue.badge === 1 ? " is" : "es are"} not synced yet`;

  return (
    <TabPage title="Settings">
      <View style={styles.section}>
        {info.map(([label, value], i) => (
          <ListRow key={label} divider={i < info.length - 1}>
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
        <ListRow divider={false} right={<Text style={styles.rightText}>{version}</Text>}>
          <Text style={styles.rowText}>App version</Text>
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
          signOutUser();
        }}
        onCancel={() => setConfirmLogout(false)}
      />
    </TabPage>
  );
}

const useStyles = makeStyles((colors) => ({
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
