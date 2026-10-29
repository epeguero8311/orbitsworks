import { View, Text, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../lib/AuthContext";
import { lightColors as colors, radii, spacing, fontSizes } from "../../lib/theme";
import { useEmployeeSelfView } from "../../lib/hooks/useEmployeeSelfView";
import { useEmployeeAppConfig } from "../../lib/hooks/useEmployeeAppConfig";
import { useNow } from "../../lib/hooks/useNow";
import { useTabBarSpace } from "../../lib/hooks/useTabBarSpace";
import { greetingFor } from "../../lib/employeeHome";
import HomeHeader from "../../components/employee/HomeHeader";
import Button from "../../components/ui/Button";

// Placeholder for Employee App tabs that aren't built yet (History,
// Notifications, Swap, Settings). route.params: { title, icon, showLogout }.
// Settings keeps the employee's Log out button (it used to be on Home).
export default function EmployeeComingSoonScreen({ route }) {
  const { userData, linkedEmployeeId, signOutUser } = useAuth();
  const insets = useSafeAreaInsets();
  const tabBarSpace = useTabBarSpace();
  const companyId = userData?.companyId;
  const employeeId = linkedEmployeeId || userData?.employeeId;
  const { view } = useEmployeeSelfView(companyId, employeeId);
  const { timezone } = useEmployeeAppConfig(companyId);
  const now = useNow(60000);
  const { title = "", icon = "clock", showLogout = false } = route?.params ?? {};

  return (
    <View style={[styles.flex, { paddingTop: insets.top + spacing.lg, paddingBottom: tabBarSpace + spacing.xxl }]}>
      <HomeHeader name={view?.name ?? ""} photoUrl={view?.photoUrl} greeting={greetingFor(now, timezone)} />
      <View style={styles.center}>
        <View style={styles.iconCircle}>
          <Feather name={icon} size={28} color={colors.accent} />
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>Coming soon</Text>
      </View>
      {showLogout ? <Button label="Log out" tone="red" variant="outline" onPress={signOutUser} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.xl },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: radii.pill,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: fontSizes.xxl, fontWeight: "700", color: colors.text, marginTop: spacing.lg },
  message: { fontSize: fontSizes.md, color: colors.subtext, marginTop: spacing.xs },
});
