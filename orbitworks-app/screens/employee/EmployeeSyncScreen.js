import { useCallback, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "../../lib/AuthContext";
import { radii, spacing, fontSizes } from "../../lib/theme";
import { useTheme } from "../../lib/ThemeContext";
import { makeStyles } from "../../lib/makeStyles";
import { useEmployeeAppConfig } from "../../lib/hooks/useEmployeeAppConfig";
import { usePunchQueue } from "../../lib/hooks/usePunchQueue";
import { useCommentQueue } from "../../lib/hooks/useCommentQueue";
import { useConnectionBanner } from "../../lib/hooks/useConnectionBanner";
import { useNow } from "../../lib/hooks/useNow";
import { siteLabel } from "../../lib/employeeHome";
import { formatWhen } from "../../lib/punchQueueLogic";
import { removePunch } from "../../lib/punchQueue";
import { removeComment } from "../../lib/commentQueue";
import { syncTabRows } from "../../lib/commentQueueLogic";
import { syncPunchQueue } from "../../lib/punchQueueSync";
import TabPage from "../../components/ui/TabPage";
import SyncRow from "../../components/employee/SyncRow";
import RemoveUnsentModal from "../../components/employee/RemoveUnsentModal";

const CONNECTION = {
  online: { label: "Online", color: "green" },
  weak: { label: "Weak signal", color: "orange" },
  offline: { label: "Offline", color: "orange" },
};

// Employee App Sync tab: this employee's punches saved on the phone
// (lib/punchQueue.js) - Waiting, Syncing, Synced or Failed - with Last
// synced and Sync now. Synced rows show for this week - Monday to today,
// company time zone (Phase 10 A2); Waiting, Syncing and Failed always show,
// however old. A Failed
// row offers Remove. RC1 follow-up: the confirm (RemoveUnsentModal) says it
// is lost for good and that the admin will be told; the removal and the
// admin's report are saved together (lib/removedReports.js) and the report
// is sent right away, or when there's signal. Phase 5: no Redo - a punch made with the PIN that was
// right at the time syncs even if an admin changed the PIN since. Shift
// comments show here too ("Comment" rows, same statuses), mixed with the
// punches newest first; a Not synced one offers Remove.
export default function EmployeeSyncScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const { userData, linkedEmployeeId } = useAuth();
  const companyId = userData?.companyId;
  const employeeId = linkedEmployeeId || userData?.employeeId;
  const { timezone } = useEmployeeAppConfig(companyId);
  const queue = usePunchQueue(companyId, employeeId, timezone);
  const comments = useCommentQueue(companyId, employeeId, timezone);
  const rows = syncTabRows(queue.rows, comments.rows);
  const connection = CONNECTION[useConnectionBanner().kind || "online"];
  const now = useNow(60000);
  const [syncing, setSyncing] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeError, setRemoveError] = useState(null);

  const syncNow = useCallback(() => {
    setSyncing(true);
    syncPunchQueue(companyId, employeeId)
      .catch(() => {})
      .finally(() => setSyncing(false));
  }, [companyId, employeeId]);

  const closeRemove = useCallback(() => {
    setRemoving(null);
    setRemoveError(null);
  }, []);

  const confirmRemove = useCallback(async () => {
    if (!removing) return;
    setRemoveBusy(true);
    setRemoveError(null);
    try {
      if (removing.action === "comment") await removeComment(removing.requestId);
      else await removePunch(removing.requestId);
    } catch {
      // Nothing was removed (the report and the removal are one write).
      setRemoveBusy(false);
      setRemoveError("Couldn't remove it. Nothing was changed.");
      return;
    }
    setRemoveBusy(false);
    closeRemove();
    // The queue was paused on this punch - carry on with the rest (and send
    // the admin's report).
    syncNow();
  }, [removing, syncNow, closeRemove]);

  const empty = rows.length === 0;
  const removingWhen = removing ? formatWhen(removing.action === "comment" ? removing.madeAtMs : removing.queuedAtMs, now, timezone) : "";
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
      {queue.paused ? <Text style={styles.paused}>Sending is paused until the failed punch below is removed.</Text> : null}

      {empty ? (
        <View style={styles.center}>
          <Feather name="check-circle" size={72} color={colors.greenStrong} />
          <Text style={styles.syncedText}>Everything is synced</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {rows.map((row, i) => (
            <SyncRow
              key={row.key}
              item={row.item}
              whenLabel={formatWhen(row.timeMs, now, timezone)}
              detail={row.kind === "comment" ? row.detail : siteLabel(row.item.siteName)}
              divider={i < rows.length - 1}
              onRemove={setRemoving}
            />
          ))}
        </View>
      )}

      <RemoveUnsentModal
        item={removing}
        whenLabel={removingWhen}
        busy={removeBusy}
        error={removeError}
        onConfirm={confirmRemove}
        onCancel={closeRemove}
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
