import { useCallback, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "../../lib/AuthContext";
import { radii, spacing, fontSizes } from "../../lib/theme";
import { useTheme } from "../../lib/ThemeContext";
import { makeStyles } from "../../lib/makeStyles";
import { useEmployeeAppConfig } from "../../lib/hooks/useEmployeeAppConfig";
import { usePunchQueue } from "../../lib/hooks/usePunchQueue";
import { useConnectionBanner } from "../../lib/hooks/useConnectionBanner";
import { useNow } from "../../lib/hooks/useNow";
import { siteLabel } from "../../lib/employeeHome";
import { ACTION_LABELS, formatWhen } from "../../lib/punchQueueLogic";
import { removePunch } from "../../lib/punchQueue";
import { syncPunchQueue } from "../../lib/punchQueueSync";
import TabPage from "../../components/ui/TabPage";
import ConfirmModal from "../../components/ui/ConfirmModal";
import SyncRow from "../../components/employee/SyncRow";

const CONNECTION = {
  online: { label: "Online", color: "green" },
  weak: { label: "Weak signal", color: "orange" },
  offline: { label: "Offline", color: "orange" },
};

// Employee App Sync tab: this employee's punches saved on the phone
// (lib/punchQueue.js) - Waiting, Syncing, Synced (kept 24 h) or Failed -
// with Last synced and Sync now. A Failed row offers one action: Redo
// (wrong PIN: type it again, the same punch is resent) or Remove (it can't
// be recorded - the confirm says so and to tell the supervisor).
export default function EmployeeSyncScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { userData, linkedEmployeeId } = useAuth();
  const companyId = userData?.companyId;
  const employeeId = linkedEmployeeId || userData?.employeeId;
  const { timezone } = useEmployeeAppConfig(companyId);
  const queue = usePunchQueue(companyId, employeeId);
  const connection = CONNECTION[useConnectionBanner().kind || "online"];
  const now = useNow(60000);
  const [syncing, setSyncing] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [removeBusy, setRemoveBusy] = useState(false);

  const syncNow = useCallback(() => {
    setSyncing(true);
    syncPunchQueue(companyId, employeeId)
      .catch(() => {})
      .finally(() => setSyncing(false));
  }, [companyId, employeeId]);

  const redo = useCallback(
    (item) => navigation.navigate("ClockPunch", { action: item.action, redoId: item.requestId }),
    [navigation]
  );

  const confirmRemove = useCallback(async () => {
    if (!removing) return;
    setRemoveBusy(true);
    try {
      await removePunch(removing.requestId);
    } finally {
      setRemoveBusy(false);
      setRemoving(null);
    }
    // The queue was paused on this punch - carry on with the rest.
    syncNow();
  }, [removing, syncNow]);

  const empty = queue.rows.length === 0;
  const lastSynced = queue.lastSyncedMs ? formatWhen(queue.lastSyncedMs, now, timezone) : "Never";

  return (
    <TabPage title="Sync" fill={empty}>
      <View style={styles.statusRow}>
        <View style={styles.status}>
          <View style={[styles.dot, { backgroundColor: colors[connection.color] }]} />
          <Text style={styles.statusText}>{connection.label}</Text>
        </View>
        <Pressable
          style={({ pressed }) => [styles.syncButton, (pressed || syncing) && styles.pressed]}
          onPress={syncNow}
          disabled={syncing}
          accessibilityRole="button"
          accessibilityLabel="Sync Now"
        >
          <Text style={styles.syncButtonText}>{syncing ? "Syncing..." : "Sync Now"}</Text>
        </Pressable>
      </View>
      <Text style={styles.lastSynced}>Last synced: {lastSynced}</Text>
      {queue.paused ? <Text style={styles.paused}>Sending is paused until the failed punch below is fixed.</Text> : null}

      {empty ? (
        <View style={styles.center}>
          <Feather name="check-circle" size={72} color={colors.greenStrong} />
          <Text style={styles.syncedText}>Everything is synced</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {queue.rows.map((item, i) => (
            <SyncRow
              key={item.requestId}
              item={item}
              whenLabel={formatWhen(item.queuedAtMs, now, timezone)}
              siteName={siteLabel(item.siteName)}
              divider={i < queue.rows.length - 1}
              onRedo={redo}
              onRemove={setRemoving}
            />
          ))}
        </View>
      )}

      <ConfirmModal
        visible={!!removing}
        title={`Remove this ${ACTION_LABELS[removing?.action] ?? "punch"}?`}
        message="This punch will NOT be recorded. Tell your supervisor so they can fix your time."
        confirmLabel="Remove"
        confirmTone="red"
        cancelLabel="Keep it"
        busy={removeBusy}
        onConfirm={confirmRemove}
        onCancel={() => setRemoving(null)}
      />
    </TabPage>
  );
}

const useStyles = makeStyles((colors) => ({
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  status: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { fontSize: fontSizes.md, fontWeight: "600", color: colors.text },
  syncButton: {
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    minHeight: 36,
    justifyContent: "center",
  },
  syncButtonText: { color: colors.onColor, fontSize: fontSizes.sm, fontWeight: "700" },
  pressed: { opacity: 0.7 },
  lastSynced: { fontSize: fontSizes.sm, color: colors.subtext, marginTop: spacing.md },
  paused: { fontSize: fontSizes.sm, color: colors.red, marginTop: spacing.xs },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.lg },
  syncedText: { fontSize: fontSizes.lg, fontWeight: "600", color: colors.text },
  list: { marginTop: spacing.xs },
}));
