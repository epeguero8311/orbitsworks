import { useState, useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useAuth } from "../lib/AuthContext";
import { useTheme } from "../lib/ThemeContext";
import { useSiteSession } from "../lib/SiteSessionContext";
import { useTodayShift } from "../lib/hooks/useTodayShift";
import { useLocalStatusOverlay } from "../lib/hooks/useLocalStatusOverlay";
import { queueBreakEvent } from "../lib/clockQueue";
import { drainQueue } from "../lib/queueSync";
import ScreenHeader from "../components/ScreenHeader";
import Avatar from "../components/Avatar";

export default function BreaksEmployeeListScreen({ navigation, route }) {
  const authorizedBy = route?.params?.authorizedBy;
  const { userData, currentUser } = useAuth();
  const { colors } = useTheme();
  const { selectedSite } = useSiteSession();
  const { employees: liveEmployees, loading } = useTodayShift(userData?.companyId);
  const employees = useLocalStatusOverlay(liveEmployees);
  const [selectedIds, setSelectedIds] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const isNoneSite = selectedSite?.id === "none";
  const siteLabel = selectedSite ? (isNoneSite ? "No Site" : selectedSite.name) : "All Sites";

  const eligible = useMemo(() => {
    const bySite =
      selectedSite && !isNoneSite
        ? employees.filter((e) => e.assignedSiteIds?.includes(selectedSite.id))
        : isNoneSite
        ? []
        : employees;
    return bySite.filter((e) => e.status === "in" || e.status === "break");
  }, [employees, selectedSite, isNoneSite]);

  const toggleSelect = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectedWorking = eligible.filter((e) => selectedIds.includes(e.id) && e.status === "in");
  const selectedOnBreak = eligible.filter((e) => selectedIds.includes(e.id) && e.status === "break");

  // Local-first: queueBreakEvent only touches SQLite, so this resolves
  // instantly whether online or not. drainQueue is fire-and-forget - it
  // uploads right away if there is signal, otherwise useQueueSync picks
  // it up on the next reconnect/foreground.
  const runBreakAction = async (targets, type) => {
    if (targets.length === 0 || submitting) return;
    setSubmitting(true);
    try {
      for (const emp of targets) {
        await queueBreakEvent({
          employee: emp,
          type,
          createdByUid: currentUser?.uid,
          authorizedBy,
          siteId: selectedSite && !isNoneSite ? selectedSite.id : null,
          siteName: selectedSite && !isNoneSite ? selectedSite.name : "Not specified",
        });
      }
      drainQueue(userData.companyId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSelectedIds((prev) => prev.filter((id) => !targets.some((t) => t.id === id)));
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      console.log("[BreaksEmployeeList] break action failed:", err.message);
    } finally {
      setSubmitting(false);
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
      <ScreenHeader title="Breaks" onBack={() => navigation.navigate("Dashboard")} />

      <View style={styles.topRow}>
        <TouchableOpacity
          style={[styles.sitePill, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => navigation.navigate("SiteSelect")}
        >
          <Feather name="map-pin" size={13} color={colors.accent} />
          <Text style={[styles.sitePillText, { color: colors.accent }]}>{siteLabel}</Text>
          <Feather name="chevron-down" size={13} color={colors.accent} />
        </TouchableOpacity>
        {authorizedBy ? (
          <Text style={[styles.authorizedText, { color: colors.subtext }]} numberOfLines={1}>
            Authorized by {authorizedBy.name}
          </Text>
        ) : null}
      </View>

      <FlatList
        data={eligible}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const isSelected = selectedIds.includes(item.id);
          const isOnBreak = item.status === "break";
          return (
            <TouchableOpacity
              style={[
                styles.row,
                { backgroundColor: colors.card, borderColor: isSelected ? colors.accent : colors.border },
              ]}
              onPress={() => toggleSelect(item.id)}
            >
              <Feather
                name={isSelected ? "check-square" : "square"}
                size={20}
                color={isSelected ? colors.accent : colors.subtext}
              />
              <Avatar name={item.name} photoUrl={item.photoUrl} size={38} />
              <View style={styles.rowText}>
                <Text style={[styles.name, { color: colors.text }]}>{item.name}</Text>
                <Text style={[styles.jobTitle, { color: colors.subtext }]}>{item.jobTitle}</Text>
              </View>
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: isOnBreak ? colors.accent : colors.background, borderColor: colors.border },
                ]}
              >
                <Text style={[styles.statusBadgeText, { color: isOnBreak ? "#fff" : colors.subtext }]}>
                  {isOnBreak ? "On Break" : "Working"}
                </Text>
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: colors.subtext }]}>
            No clocked-in employees{selectedSite && !isNoneSite ? " at this site" : ""}.
          </Text>
        }
      />

      <View style={[styles.actionsRow, { borderColor: colors.border }]}>
        <TouchableOpacity
          style={[
            styles.actionButton,
            { backgroundColor: colors.accent, opacity: selectedWorking.length === 0 || submitting ? 0.4 : 1 },
          ]}
          onPress={() => runBreakAction(selectedWorking, "breakStart")}
          disabled={selectedWorking.length === 0 || submitting}
        >
          <Text style={styles.actionButtonText}>
            Start Break{selectedWorking.length > 0 ? ` (${selectedWorking.length})` : ""}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.actionButton,
            { backgroundColor: colors.accent, opacity: selectedOnBreak.length === 0 || submitting ? 0.4 : 1 },
          ]}
          onPress={() => runBreakAction(selectedOnBreak, "breakEnd")}
          disabled={selectedOnBreak.length === 0 || submitting}
        >
          <Text style={styles.actionButtonText}>
            End Break{selectedOnBreak.length > 0 ? ` (${selectedOnBreak.length})` : ""}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  topRow: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 },
  sitePill: {
    flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14,
    paddingVertical: 7, borderRadius: 20, borderWidth: 1, alignSelf: "flex-start", marginBottom: 8,
  },
  sitePillText: { fontSize: 13, fontWeight: "600" },
  authorizedText: { fontSize: 12 },
  list: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 12, padding: 14,
    borderRadius: 14, borderWidth: 1.5, marginBottom: 10,
  },
  rowText: { flex: 1 },
  name: { fontSize: 15, fontWeight: "600" },
  jobTitle: { fontSize: 12, marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, borderWidth: 1 },
  statusBadgeText: { fontSize: 11, fontWeight: "700" },
  empty: { textAlign: "center", marginTop: 40 },
  actionsRow: { flexDirection: "row", gap: 12, padding: 20, borderTopWidth: 1 },
  actionButton: { flex: 1, borderRadius: 14, paddingVertical: 16, alignItems: "center" },
  actionButtonText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});