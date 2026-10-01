import { useRef, useState } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Modal } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../lib/ThemeContext";
import { useAlertsFeed } from "../lib/hooks/useAlertsFeed";
import { ALERT_TYPES, ALERT_TYPE_LABEL } from "../lib/alertTypes";
import ScreenHeader from "../components/ScreenHeader";

const UNREAD_DOT_COLOR = "#eab308";

function formatTime(occurredAt) {
  const date = occurredAt?.toDate ? occurredAt.toDate() : null;
  if (!date) return "";
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const FILTERS = [{ key: "all", label: "All" }, { key: "unread", label: "Unread" }, ...ALERT_TYPES.map((t) => ({ key: t, label: ALERT_TYPE_LABEL[t] }))];

// View only, per the spec: no buttons to clock out, edit, ignore, or
// dismiss anything - alerts never block or change a clock event. The only
// thing that ever changes here is read state, and that's manual only:
// opening this tab never marks anything read - only the "Mark Seen"
// button does.
export default function AlertsScreen({ route }) {
  const { colors } = useTheme();
  const { alerts, unreadCount, markAllRead } = useAlertsFeed();
  const [filter, setFilter] = useState("all");
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const highlightedRef = useRef(route?.params?.alertId ?? null);

  const filtered = alerts.filter((a) => {
    if (filter === "all") return true;
    if (filter === "unread") return a.unread;
    return a.alertType === filter;
  });

  const activeFilterLabel = FILTERS.find((f) => f.key === filter)?.label ?? "All";

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Alerts"
        right={
          unreadCount > 0 ? (
            <TouchableOpacity
              style={[styles.markAllButton, { backgroundColor: colors.accent }]}
              onPress={markAllRead}
              activeOpacity={0.8}
            >
              <Text style={styles.markAllText}>Mark Seen</Text>
            </TouchableOpacity>
          ) : null
        }
      />

      <View style={styles.filterBar}>
        <TouchableOpacity
          style={[styles.filterButton, { borderColor: colors.border, backgroundColor: colors.card }]}
          onPress={() => setFilterModalVisible(true)}
          activeOpacity={0.8}
        >
          <Feather name="filter" size={14} color={colors.text} />
          <Text style={[styles.filterButtonText, { color: colors.text }]}>{activeFilterLabel}</Text>
          <Feather name="chevron-down" size={14} color={colors.subtext} />
        </TouchableOpacity>
      </View>

      <Modal
        visible={filterModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setFilterModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setFilterModalVisible(false)}
        >
          <View style={[styles.modalCard, { backgroundColor: colors.background }]}>
            <Text style={[styles.modalTitle, { color: colors.subtext }]}>Filter Alerts</Text>
            {FILTERS.map((f) => {
              const active = filter === f.key;
              return (
                <TouchableOpacity
                  key={f.key}
                  style={[styles.modalOption, { borderTopColor: colors.border }]}
                  onPress={() => {
                    setFilter(f.key);
                    setFilterModalVisible(false);
                  }}
                >
                  <Text style={[styles.modalOptionText, { color: active ? colors.accent : colors.text }]}>
                    {f.label}
                  </Text>
                  {active && <Feather name="check" size={18} color={colors.accent} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View
            style={[
              styles.row,
              { borderBottomColor: colors.border },
              item.id === highlightedRef.current && { backgroundColor: colors.card },
            ]}
          >
            <View style={styles.dot}>
              {item.unread && <View style={[styles.dotFill, { backgroundColor: UNREAD_DOT_COLOR }]} />}
            </View>
            <View style={styles.rowText}>
              <Text style={[styles.title, { color: colors.text }, item.unread && styles.titleUnread]}>
                {item.employeeName ?? "All Sites"}
              </Text>
              <Text style={[styles.message, { color: colors.subtext }]}>{item.message}</Text>
              <Text style={[styles.meta, { color: colors.subtext }]}>
                {item.siteName ? `${item.siteName} - ` : ""}
                {formatTime(item.occurredAt)}
              </Text>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="bell" size={40} color={colors.subtext} />
            <Text style={[styles.emptyText, { color: colors.subtext }]}>No alerts yet.</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  markAllButton: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  markAllText: { fontSize: 13, fontWeight: "700", color: "#fff" },
  filterBar: { paddingHorizontal: 20, paddingVertical: 10 },
  filterButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  filterButtonText: { fontSize: 13, fontWeight: "600" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: 32 },
  modalCard: { borderRadius: 16, paddingHorizontal: 20, paddingBottom: 8, maxHeight: "70%" },
  modalTitle: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", paddingTop: 18, paddingBottom: 6 },
  modalOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderTopWidth: 1,
  },
  modalOptionText: { fontSize: 15, fontWeight: "500" },
  list: { paddingHorizontal: 20, flexGrow: 1 },
  row: { flexDirection: "row", paddingVertical: 14, borderBottomWidth: 1, gap: 12, borderRadius: 8 },
  dot: { width: 9, height: 9, marginTop: 5, alignItems: "center", justifyContent: "center" },
  dotFill: { width: 9, height: 9, borderRadius: 5 },
  rowText: { flex: 1 },
  title: { fontSize: 15, fontWeight: "500" },
  titleUnread: { fontWeight: "700" },
  message: { fontSize: 13, marginTop: 2 },
  meta: { fontSize: 12, marginTop: 4 },
  empty: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12, paddingTop: 80 },
  emptyText: { fontSize: 14 },
});
