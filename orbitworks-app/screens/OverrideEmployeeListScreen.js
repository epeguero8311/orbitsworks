import { useMemo, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useAuth } from "../lib/AuthContext";
import { useTheme } from "../lib/ThemeContext";
import { useSiteSession } from "../lib/SiteSessionContext";
import { useTodayShift } from "../lib/hooks/useTodayShift";
import { useLocalStatusOverlay } from "../lib/hooks/useLocalStatusOverlay";
import { queueOverrideClockIn, queueOverrideClockOut } from "../lib/clockQueue";
import { drainQueue } from "../lib/queueSync";
import ScreenHeader from "../components/ScreenHeader";
import Avatar from "../components/Avatar";

export default function OverrideEmployeeListScreen({ navigation, route }) {
  const authorizedBy = route?.params?.authorizedBy;
  const { userData, currentUser } = useAuth();
  const { colors } = useTheme();
  const { selectedSite } = useSiteSession();
  const { employees: liveEmployees, loading } = useTodayShift(userData?.companyId);
  const employees = useLocalStatusOverlay(liveEmployees);
  const [direction, setDirection] = useState("in");
  const [selectedIds, setSelectedIds] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const isNoneSite = selectedSite?.id === "none";
  const siteLabel = selectedSite ? (isNoneSite ? "No Site" : selectedSite.name) : "All Sites";

  const bySite = useMemo(() => {
    if (selectedSite && !isNoneSite) {
      return employees.filter((e) => e.assignedSiteIds?.includes(selectedSite.id));
    }
    if (isNoneSite) return [];
    return employees;
  }, [employees, selectedSite, isNoneSite]);

  const STATUS_SORT_ORDER = { in: 0, break: 0, out: 1 };

  const eligible = useMemo(() => {
    return bySite
      .filter((e) =>
        direction === "in" ? e.status === "out" : e.status === "in" || e.status === "break"
      )
      .sort((a, b) => STATUS_SORT_ORDER[a.status] - STATUS_SORT_ORDER[b.status]);
  }, [bySite, direction]);

  function handleDirectionChange(next) {
    if (next === direction) return;
    setDirection(next);
    setSelectedIds([]);
  }

  const toggleSelect = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selected = eligible.filter((e) => selectedIds.includes(e.id));

  // Local-first: each queue call only touches SQLite, so the whole
  // batch resolves instantly regardless of connectivity. drainQueue is
  // fire-and-forget - starts uploading now if there is signal, otherwise
  // useQueueSync catches it on the next reconnect/foreground.
  async function handleSubmit() {
    if (selected.length === 0 || submitting) return;
    setSubmitting(true);
    try {
      const siteId = selectedSite && !isNoneSite ? selectedSite.id : null;
      const siteName = selectedSite && !isNoneSite ? selectedSite.name : "Not specified";

      for (const emp of selected) {
        if (direction === "in") {
          await queueOverrideClockIn({
            employee: emp,
            createdByUid: currentUser?.uid,
            authorizedBy,
            siteId,
            siteName,
          });
        } else {
          await queueOverrideClockOut({
            employee: emp,
            createdByUid: currentUser?.uid,
            authorizedBy,
            siteId,
            siteName,
          });
        }
      }
      drainQueue(userData.companyId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.navigate("Dashboard");
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      console.log("[OverrideEmployeeList] override action failed:", err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Supervisor Override" onBack={() => navigation.navigate("Dashboard")} />

      <View style={styles.topRow}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={[styles.sitePill, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => navigation.navigate("SiteSelect")}
          >
            <Feather name="map-pin" size={13} color={colors.accent} />
            <Text style={[styles.sitePillText, { color: colors.accent }]}>{siteLabel}</Text>
            <Feather name="chevron-down" size={13} color={colors.accent} />
          </TouchableOpacity>

          <View style={styles.directionRow}>
            <TouchableOpacity
              style={[
                styles.directionButton,
                { borderColor: colors.border },
                direction === "in" && { backgroundColor: colors.accent, borderColor: colors.accent },
              ]}
              onPress={() => handleDirectionChange("in")}
            >
              <Text
                style={[
                  styles.directionButtonText,
                  { color: direction === "in" ? "#fff" : colors.subtext },
                ]}
              >
                Clock In
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.directionButton,
                { borderColor: colors.border },
                direction === "out" && { backgroundColor: colors.accent, borderColor: colors.accent },
              ]}
              onPress={() => handleDirectionChange("out")}
            >
              <Text
                style={[
                  styles.directionButtonText,
                  { color: direction === "out" ? "#fff" : colors.subtext },
                ]}
              >
                Clock Out
              </Text>
            </TouchableOpacity>
          </View>
        </View>

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
              {direction === "out" && isOnBreak ? (
                <View style={[styles.breakBadge, { backgroundColor: colors.accent }]}>
                  <Text style={styles.breakBadgeText}>On break</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: colors.subtext }]}>
            {direction === "in"
              ? `No clocked-out employees${selectedSite && !isNoneSite ? " at this site" : ""}.`
              : `No one currently clocked in${selectedSite && !isNoneSite ? " at this site" : ""}.`}
          </Text>
        }
      />

      <View style={[styles.actionsRow, { borderColor: colors.border }]}>
        <TouchableOpacity
          style={[
            styles.actionButton,
            { backgroundColor: colors.accent, opacity: selected.length === 0 || submitting ? 0.4 : 1 },
          ]}
          onPress={handleSubmit}
          disabled={selected.length === 0 || submitting}
        >
          <Text style={styles.actionButtonText}>
            {direction === "in" ? "Clock In" : "Clock Out"}
            {selected.length > 0 ? ` (${selected.length})` : ""}
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
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  sitePill: {
    flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14,
    paddingVertical: 7, borderRadius: 20, borderWidth: 1,
  },
  sitePillText: { fontSize: 13, fontWeight: "600" },
  directionRow: { flexDirection: "row", gap: 8 },
  directionButton: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5,
  },
  directionButtonText: { fontSize: 13, fontWeight: "700" },
  authorizedText: { fontSize: 12 },
  list: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 12, padding: 14,
    borderRadius: 14, borderWidth: 1.5, marginBottom: 10,
  },
  rowText: { flex: 1 },
  name: { fontSize: 15, fontWeight: "600" },
  jobTitle: { fontSize: 12, marginTop: 2 },
  breakBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  breakBadgeText: { fontSize: 11, fontWeight: "700", color: "#fff" },
  empty: { textAlign: "center", marginTop: 40 },
  actionsRow: { padding: 20, borderTopWidth: 1 },
  actionButton: { borderRadius: 14, paddingVertical: 16, alignItems: "center" },
  actionButtonText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});