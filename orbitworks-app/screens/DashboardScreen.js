import { useState, useCallback } from "react";
import { useFocusEffect } from "@react-navigation/native";
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, RefreshControl,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "../lib/AuthContext";
import { useTheme } from "../lib/ThemeContext";
import { useSiteSession } from "../lib/SiteSessionContext";
import { useTodayShift } from "../lib/hooks/useTodayShift";
import { useCompanySettings } from "../lib/hooks/useCompanySettings";
import { useLocalStatusOverlay } from "../lib/hooks/useLocalStatusOverlay";
import { useLocalEmployee } from "../lib/hooks/useLocalEmployee";
import { syncPinTable } from "../lib/pinSync";
import { drainQueue } from "../lib/queueSync";
import OfflineBanner from "../components/OfflineBanner";
import Avatar from "../components/Avatar";

const ASK_SITE_KEY = "orbitworks_ask_site_each_time";

export default function DashboardScreen({ navigation }) {
  const { userData, currentUser } = useAuth();
  const { colors, isDark } = useTheme();
  const { selectedSite } = useSiteSession();
  const { employees: liveEmployees, loading } = useTodayShift(userData?.companyId);
  const employees = useLocalStatusOverlay(liveEmployees);
  const { settings } = useCompanySettings(userData?.companyId);
  const localSupervisor = useLocalEmployee(currentUser?.uid);
  const [askSite, setAskSite] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem(ASK_SITE_KEY).then((val) => {
        if (val !== null) setAskSite(val === "true");
      });
    }, [])
  );

  const isNoneSite = selectedSite?.id === "none";
  const filteredEmployees =
    selectedSite && !isNoneSite
      ? employees.filter((e) => e.assignedSiteIds?.includes(selectedSite.id))
      : isNoneSite
      ? []
      : employees;

  const clockedInCount = filteredEmployees.filter((e) => e.status === "in" || e.status === "break").length;
  const onBreakCount = filteredEmployees.filter((e) => e.status === "break").length;

  // Live Firestore data wins when it is available (it is fresher and
  // reflects real-time status). The local cache is the fallback for a
  // fully offline cold start, before any live snapshot has arrived.
  const supervisor = employees.find((e) => e.id === currentUser?.uid);
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

  const handleClockPress = () => {
    if (askSite) {
      navigation.navigate("SiteSelect", { afterSelect: "PinEntry" });
    } else {
      navigation.navigate("PinEntry");
    }
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
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

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
          <TouchableOpacity onPress={() => navigation.navigate("Settings")}>
            <Feather name="settings" size={22} color={colors.accent} />
          </TouchableOpacity>
        </View>

        <View style={[styles.blueCard, { backgroundColor: colors.accent }]}>
          <TouchableOpacity style={styles.sitePill} onPress={() => navigation.navigate("SiteSelect")}>
            <Text style={styles.sitePillText}>{siteLabel}</Text>
            <Feather name="chevron-down" size={14} color="#fff" />
          </TouchableOpacity>

          <Text style={styles.countNumber}>{clockedInCount}</Text>
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
            <Text style={[styles.quickCardText, { color: colors.text }]}>Notes</Text>
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
  greeting: { fontSize: 12 },
  name: { fontSize: 16, fontWeight: "700", marginTop: 1 },
  blueCard: { borderRadius: 24, padding: 22, marginBottom: 24 },
  sitePill: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", marginBottom: 18 },
  sitePillText: { color: "#fff", fontSize: 13, fontWeight: "600", opacity: 0.9 },
  countNumber: { color: "#fff", fontSize: 56, fontWeight: "800", textAlign: "center" },
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
  hoursRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
    marginTop: 16, marginBottom: 20, justifyContent: "center",
  },
  hoursText: { fontSize: 12, fontWeight: "500" },
});