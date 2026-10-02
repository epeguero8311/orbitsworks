import { useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, RefreshControl,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "../lib/AuthContext";
import { useTheme } from "../lib/ThemeContext";
import { useSiteSession } from "../lib/SiteSessionContext";
import { useTodayShift } from "../lib/hooks/useTodayShift";
import { useCompanySettings } from "../lib/hooks/useCompanySettings";
import { useLocalStatusOverlay } from "../lib/hooks/useLocalStatusOverlay";
import { useLocalEmployee } from "../lib/hooks/useLocalEmployee";
import { useEmployeeSyncAlertCount } from "../lib/hooks/useEmployeeSyncAlertCount";
import { syncPinTable } from "../lib/pinSync";
import { drainQueue } from "../lib/queueSync";
import { drainEmployeeQueue } from "../lib/employeeQueueSync";
import OfflineBanner from "../components/OfflineBanner";
import Avatar from "../components/Avatar";

export default function DashboardScreen({ navigation }) {
  const { userData, currentUser, linkedEmployeeId } = useAuth();
  const { colors, isDark } = useTheme();
  const { selectedSite } = useSiteSession();
  const { employees: liveEmployees, loading } = useTodayShift(userData?.companyId);
  const employees = useLocalStatusOverlay(liveEmployees);
  const { settings } = useCompanySettings(userData?.companyId);
  const localSupervisor = useLocalEmployee(linkedEmployeeId);
  const employeeSyncAlertCount = useEmployeeSyncAlertCount();
  const [refreshing, setRefreshing] = useState(false);

  // Create Employee (mobile) - supervisors and admins only, and only while
  // the company's toggle is on (Settings > App Settings on the web
  // dashboard). Owner carries the same access as admin everywhere else in
  // this app's role checks.
  const canCreateEmployee =
    (userData?.role === "supervisor" || userData?.role === "admin" || userData?.role === "owner") &&
    settings.appSettings.allowAppEmployeeCreate;

  const isNoneSite = selectedSite?.id === "none";
  const filteredEmployees =
    selectedSite && !isNoneSite
      ? employees.filter((e) => e.assignedSiteIds?.includes(selectedSite.id))
      : isNoneSite
      ? employees.filter((e) => !e.assignedSiteIds || e.assignedSiteIds.length === 0)
      : employees;

  const clockedInCount = filteredEmployees.filter((e) => e.status === "in" || e.status === "break").length;
  const onBreakCount = filteredEmployees.filter((e) => e.status === "break").length;

  // Live Firestore data wins when it is available (it is fresher and
  // reflects real-time status). The local cache is the fallback for a
  // fully offline cold start, before any live snapshot has arrived.
  const supervisor = employees.find((e) => e.id === linkedEmployeeId);
  const displayName = supervisor?.name ?? localSupervisor?.name ?? currentUser?.email ?? "";
  const avatarPhotoUrl = supervisor?.photoUrl ?? localSupervisor?.photoUrl ?? null;

  const siteLabel = selectedSite ? (isNoneSite ? "No Site" : selectedSite.name) : "All Sites";

  const formatHour = (time24) => {
    const [h, m] = time24.split(":").map(Number);
    const period = h >= 12 ? "PM" : "AM";
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return m === 0 ? `${hour12}${period}` : `${hour12}:${String(m).padStart(2, "0")}${period}`;
  };

  const hoursLabel = `${formatHour(settings.businessHours.open)} - ${formatHour(settings.businessHours.close)}`;

  // Clocking in never shows a site picker anymore: ClockCameraScreen
  // resolves the site itself once the employee is known - geofencing
  // (Pro) detects it from location, "Ask for job site each time"
  // auto-detects it from the employee's own assignment, and otherwise it
  // falls back to the site FILTER pill above (a separate concept - see
  // SiteSessionContext.js).
  const handleClockPress = () => {
    navigation.navigate("PinEntry");
  };

  // Manual safety valve: re-pulls the employee/PIN table (picks up
  // anyone newly added or edited) and drains anything still sitting in
  // the local queue. syncPinTable will throw if there is no signal -
  // swallowed here since the point is "try, and stop spinning either
  // way," not to surface an error for what is an expected offline case.
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        syncPinTable().catch(() => {}),
        drainQueue(userData?.companyId),
        drainEmployeeQueue(userData?.companyId),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />
        }
      >
        <View style={styles.header}>
          <Avatar name={displayName} photoUrl={avatarPhotoUrl} size={48} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={[styles.greeting, { color: colors.subtext }]}>Welcome</Text>
            <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{displayName}</Text>
          </View>
          {employeeSyncAlertCount > 0 && (
            <TouchableOpacity
              style={styles.bellButton}
              onPress={() => navigation.navigate("EmployeeSyncAlerts")}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Feather name="alert-triangle" size={22} color={colors.red} />
              <View style={[styles.badge, { backgroundColor: colors.red }]}>
                <Text style={styles.badgeText}>{employeeSyncAlertCount > 9 ? "9+" : employeeSyncAlertCount}</Text>
              </View>
            </TouchableOpacity>
          )}
        </View>

        <View style={[styles.blueCard, { backgroundColor: colors.accent }]}>
          <TouchableOpacity style={styles.sitePill} onPress={() => navigation.navigate("SiteSelect")}>
            <Text style={styles.sitePillText}>{siteLabel}</Text>
            <Feather name="chevron-down" size={14} color="#fff" />
          </TouchableOpacity>

          {loading ? (
            <ActivityIndicator size="large" color="#fff" style={styles.countSpinner} />
          ) : (
            <Text style={styles.countNumber}>{clockedInCount}</Text>
          )}
          <Text style={styles.countLabel}>Active employees</Text>

          <TouchableOpacity style={styles.clockButton} onPress={handleClockPress} activeOpacity={0.85}>
            <Text style={[styles.clockButtonText, { color: colors.accent }]}>Clock In / Out</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.sectionLabel, { color: colors.subtext }]}>Quick Actions</Text>

        <View style={styles.quickRow}>
          <TouchableOpacity
            style={[styles.quickCard, { borderColor: colors.border, backgroundColor: colors.card }]}
            onPress={() => navigation.navigate("EmployeeList")}
          >
            <Feather name="users" size={22} color={colors.accent} />
            <Text style={[styles.quickCardText, { color: colors.text }]}>Employee List</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.quickCard, { borderColor: colors.border, backgroundColor: colors.card }]}
            onPress={() => navigation.navigate("Notes")}
          >
            <Feather name="edit-3" size={22} color={colors.accent} />
            <Text style={[styles.quickCardText, { color: colors.text }]}>Reports</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.statCard, { backgroundColor: colors.accent }]}
          onPress={() => navigation.navigate("BreaksPinEntry")}
          activeOpacity={0.85}
        >
          <View style={styles.breaksLeft}>
            <Feather name="coffee" size={22} color="#fff" />
            <View>
              <Text style={styles.statLabel}>Breaks</Text>
              <Text style={styles.breaksSubtext}>
                {onBreakCount > 0 ? `${onBreakCount} currently on break` : "Tap to manage breaks"}
              </Text>
            </View>
          </View>
          <Feather name="chevron-right" size={22} color="#fff" />
        </TouchableOpacity>

        {canCreateEmployee && (
          <TouchableOpacity
            style={[styles.createEmployeeCard, { borderColor: colors.border, backgroundColor: colors.card }]}
            onPress={() => navigation.navigate("CreateEmployee")}
            activeOpacity={0.85}
          >
            <View style={styles.breaksLeft}>
              <Feather name="user-plus" size={22} color={colors.accent} />
              <Text style={[styles.createEmployeeText, { color: colors.text }]}>Create Employee</Text>
            </View>
            <Feather name="chevron-right" size={22} color={colors.subtext} />
          </TouchableOpacity>
        )}

        <View style={[styles.hoursRow, { borderColor: colors.border }]}>
          <Feather name="clock" size={14} color={colors.subtext} />
          <Text style={[styles.hoursText, { color: colors.subtext }]}>
            Business hours: {hoursLabel}
          </Text>
        </View>
      </ScrollView>

      <OfflineBanner />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, paddingHorizontal: 20 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: { flexDirection: "row", alignItems: "center", paddingTop: 60, marginBottom: 20 },
  bellButton: { marginRight: 18 },
  badge: {
    position: "absolute", top: -4, right: -6, minWidth: 16, height: 16, borderRadius: 8,
    alignItems: "center", justifyContent: "center", paddingHorizontal: 3,
  },
  badgeText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  greeting: { fontSize: 12 },
  name: { fontSize: 16, fontWeight: "700", marginTop: 1 },
  blueCard: { borderRadius: 24, padding: 22, marginBottom: 24 },
  sitePill: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", marginBottom: 18 },
  sitePillText: { color: "#fff", fontSize: 13, fontWeight: "600", opacity: 0.9 },
  countNumber: { color: "#fff", fontSize: 56, fontWeight: "800", textAlign: "center" },
  countSpinner: { marginVertical: 14 },
  countLabel: { color: "#fff", fontSize: 14, textAlign: "center", opacity: 0.9, marginBottom: 20 },
  clockButton: { backgroundColor: "#fff", borderRadius: 14, paddingVertical: 16, alignItems: "center" },
  clockButtonText: { fontSize: 16, fontWeight: "700" },
  sectionLabel: { fontSize: 13, fontWeight: "600", marginBottom: 10 },
  quickRow: { flexDirection: "row", gap: 12, marginBottom: 20 },
  quickCard: { flex: 1, borderWidth: 1, borderRadius: 16, paddingVertical: 22, alignItems: "center", gap: 8 },
  quickCardText: { fontSize: 13, fontWeight: "600" },
  statCard: {
    borderRadius: 18, paddingVertical: 18, paddingHorizontal: 20,
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
  },
  breaksLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  statLabel: { color: "#fff", fontSize: 15, fontWeight: "700" },
  breaksSubtext: { color: "#fff", fontSize: 12, opacity: 0.9, marginTop: 2 },
  createEmployeeCard: {
    borderRadius: 18, borderWidth: 1, paddingVertical: 16, paddingHorizontal: 20,
    flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12,
  },
  createEmployeeText: { fontSize: 15, fontWeight: "700" },
  hoursRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
    marginTop: 16, marginBottom: 20, justifyContent: "center",
  },
  hoursText: { fontSize: 12, fontWeight: "500" },
});