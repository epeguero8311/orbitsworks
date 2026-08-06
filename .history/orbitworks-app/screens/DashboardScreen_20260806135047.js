import { useState, useCallback } from "react";
import { useFocusEffect } from "@react-navigation/native";
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Image,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "../lib/AuthContext";
import { useTheme } from "../lib/ThemeContext";
import { useSiteSession } from "../lib/SiteSessionContext";
import { useTodayShift } from "../lib/hooks/useTodayShift";
import { useCompanySettings } from "../lib/hooks/useCompanySettings";

const ASK_SITE_KEY = "orbitworks_ask_site_each_time";

export default function DashboardScreen({ navigation }) {
  const { userData, currentUser } = useAuth();
  const { colors, isDark } = useTheme();
  const { selectedSite } = useSiteSession();
  const { employees, todayInEvents, loading } = useTodayShift(userData?.companyId);
  const { settings } = useCompanySettings(userData?.companyId);
  const [askSite, setAskSite] = useState(true);

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

  const clockedInCount = filteredEmployees.filter((e) => e.status === "in").length;
  const supervisor = employees.find((e) => e.id === currentUser?.uid);
  const displayName = supervisor?.name ?? currentUser?.email ?? "";

  const siteLabel = selectedSite ? (isNoneSite ? "No Site" : selectedSite.name) : "All Sites";

  const onTimePercent = (() => {
    if (todayInEvents.length === 0) return null;
    const [openH, openM] = settings.businessHours.open.split(":").map(Number);
    const graceMinutes = 15;
    const onTimeCount = todayInEvents.filter((evt) => {
      const cutoff = new Date(evt.timestamp);
      cutoff.setHours(openH, openM + graceMinutes, 0, 0);
      return evt.timestamp <= cutoff;
    }).length;
    return Math.round((onTimeCount / todayInEvents.length) * 100);
  })();

  const handleClockPress = () => {
    if (askSite) {
      navigation.navigate("SiteSelect", { afterSelect: "PinEntry" });
    } else {
      navigation.navigate("PinEntry");
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
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        {supervisor?.photoUrl ? (
          <Image source={{ uri: supervisor.photoUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatarPlaceholder, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={{ color: colors.subtext, fontWeight: "700" }}>
              {displayName.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
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

      <View style={[styles.statCard, { backgroundColor: colors.accent }]}>
        <Text style={styles.statLabel}>Clocked in{"\n"}on time</Text>
        <Text style={styles.statPercent}>
          {onTimePercent === null ? "—" : `${onTimePercent}%`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: { flexDirection: "row", alignItems: "center", paddingTop: 60, marginBottom: 20 },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarPlaceholder: {
    width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", borderWidth: 1,
  },
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
  statLabel: { color: "#fff", fontSize: 14, fontWeight: "600", lineHeight: 18 },
  statPercent: { color: "#fff", fontSize: 30, fontWeight: "800" },
});
