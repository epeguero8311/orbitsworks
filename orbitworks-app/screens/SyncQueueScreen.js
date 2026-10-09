import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../lib/ThemeContext";
import { useSyncQueue } from "../lib/hooks/useSyncQueue";
import ScreenHeader from "../components/ScreenHeader";
import DevSyncFaultPanel from "../components/DevSyncFaultPanel";

const ACTION_LABEL = { in: "Clock In", out: "Clock Out", breakStart: "Break Start", breakEnd: "Break End" };
const STATUS_LABEL = { pending: "Waiting", syncing: "Syncing", synced: "Synced", failed: "Failed", dead: "Stuck" };

function statusColor(status, colors) {
  if (status === "synced") return colors.green;
  if (status === "failed") return colors.red;
  if (status === "dead") return colors.red;
  if (status === "syncing") return colors.accent;
  return colors.dotOff;
}

function formatTime(ms) {
  return new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function SyncQueueScreen() {
  const { colors } = useTheme();
  const { items, online, syncing, syncNow, retry } = useSyncQueue();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Sync Queue" />

      {/* Dev-only fault injection panel. __DEV__ is a compile-time literal
          in a production bundle (false), so this whole block - including
          the DevSyncFaultPanel import's usage - is dead code a release
          build's minifier removes. See lib/syncFaults.js for the full
          guarantee and the production checklist for how to verify it. */}
      {__DEV__ && <DevSyncFaultPanel items={items} />}

      <View style={[styles.statusBar, { borderBottomColor: colors.border }]}>
        <View style={styles.statusLeft}>
          <View style={[styles.dot, { backgroundColor: online ? colors.green : colors.red }]} />
          <Text style={[styles.statusText, { color: colors.subtext }]}>{online ? "Online" : "Offline"}</Text>
        </View>
        <TouchableOpacity
          style={[styles.syncButton, { backgroundColor: colors.accent }, syncing && { opacity: 0.6 }]}
          onPress={syncNow}
          disabled={syncing || !online}
        >
          {syncing ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Feather name="refresh-cw" size={14} color="#fff" />
          )}
          <Text style={styles.syncButtonText}>Sync Now</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.localId}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={[styles.row, { borderBottomColor: colors.border }]}>
            <View style={styles.rowTop}>
              <Text style={[styles.action, { color: colors.text }]}>
                {ACTION_LABEL[item.type] ?? item.type}
              </Text>
              <View style={styles.statusWrap}>
                <View style={[styles.statusDot, { backgroundColor: statusColor(item.syncStatus, colors) }]} />
                <Text style={[styles.statusLabel, { color: colors.subtext }]}>
                  {STATUS_LABEL[item.syncStatus] ?? item.syncStatus}
                </Text>
              </View>
            </View>
            <Text style={[styles.meta, { color: colors.subtext }]}>
              {item.employeeName} - {formatTime(item.clientTimestamp)}
            </Text>
            {item.syncStatus === "failed" && (
              <View style={styles.failedRow}>
                <Text style={[styles.failedReason, { color: colors.red }]} numberOfLines={2}>
                  {item.lastError || "Sync failed"}
                </Text>
                <TouchableOpacity onPress={syncNow} disabled={syncing || !online}>
                  <Text style={[styles.retry, { color: colors.accent }]}>Retry</Text>
                </TouchableOpacity>
              </View>
            )}
            {item.syncStatus === "dead" && (
              <View style={styles.failedRow}>
                <Text style={[styles.failedReason, { color: colors.red }]} numberOfLines={2}>
                  Gave up after {item.attempts} attempts: {item.lastError || "Sync failed"}
                </Text>
                <TouchableOpacity onPress={() => retry(item.localId)} disabled={syncing || !online}>
                  <Text style={[styles.retry, { color: colors.accent }]}>Retry</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="check-circle" size={40} color={colors.subtext} />
            <Text style={[styles.emptyText, { color: colors.subtext }]}>Everything's synced.</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  statusBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  statusLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 13, fontWeight: "600" },
  syncButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  syncButtonText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  list: { paddingHorizontal: 20, paddingTop: 8, flexGrow: 1 },
  row: { paddingVertical: 12, borderBottomWidth: 1 },
  rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  action: { fontSize: 15, fontWeight: "600" },
  statusWrap: { flexDirection: "row", alignItems: "center", gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusLabel: { fontSize: 13 },
  meta: { fontSize: 13, marginTop: 2 },
  failedRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6 },
  failedReason: { fontSize: 12, flex: 1, marginRight: 12 },
  retry: { fontSize: 13, fontWeight: "700" },
  empty: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12, paddingTop: 80 },
  emptyText: { fontSize: 14 },
});
