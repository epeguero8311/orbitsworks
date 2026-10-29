import { useState } from "react";
import { View, Text, Switch, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import Constants from "expo-constants";
import { useAuth } from "../../lib/AuthContext";
import { spacing, fontSizes } from "../../lib/theme";
import { useTheme } from "../../lib/ThemeContext";
import { makeStyles } from "../../lib/makeStyles";
import { MOCK_SETTINGS } from "../../lib/mockData";
import TabPage from "../../components/ui/TabPage";
import ListRow from "../../components/ui/ListRow";

// Employee App Settings tab - LAYOUT ONLY. The info, Notifications /
// Location and "Last synced" are mock data (lib/mockData.js) and those
// switches save nothing. Real: Dark mode (same saved setting as the
// supervisor app), the app version and Log out.
export default function EmployeeSettingsScreen() {
  const { colors, isDark, toggleTheme } = useTheme();
  const styles = useStyles();
  const { signOutUser } = useAuth();
  const [notifications, setNotifications] = useState(MOCK_SETTINGS.notifications);
  const [location, setLocation] = useState(MOCK_SETTINGS.location);
  const version = Constants.expoConfig?.version ?? "";

  const info = [
    ["Logged in as", MOCK_SETTINGS.email],
    ["PIN", MOCK_SETTINGS.pin],
    ["Birthday", MOCK_SETTINGS.birthday],
  ];
  const toggles = [
    ["Dark mode", isDark, toggleTheme],
    ["Notifications", notifications, setNotifications],
    ["Location", location, setLocation],
  ];

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
        <ListRow right={<Text style={styles.rightText}>{MOCK_SETTINGS.lastSynced}</Text>}>
          <Text style={styles.rowText}>Last synced</Text>
        </ListRow>
        <ListRow divider={false} right={<Text style={styles.rightText}>{version}</Text>}>
          <Text style={styles.rowText}>App version</Text>
        </ListRow>
      </View>

      <View style={styles.section}>
        <ListRow
          divider={false}
          onPress={signOutUser}
          accessibilityLabel="Log out"
          right={<Feather name="log-out" size={20} color={colors.redStrong} />}
        >
          <Text style={styles.logout}>Log out</Text>
        </ListRow>
      </View>
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
