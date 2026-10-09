import { useEffect, useState } from "react";
import { View, Text, Switch, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { useTheme } from "../lib/ThemeContext";
import { FIREBASE_ENV, FIREBASE_PROJECT_ID } from "../lib/firebase";
import { isQueueSyncing } from "../lib/queueSync";
import {
  getSyncFaults,
  subscribeSyncFaults,
  setHangUpload,
  setHangSetDoc,
  setFailSetDoc,
  setHangWholeDrain,
  setTimeoutOverrideMs,
  clearAllSyncFaults,
} from "../lib/syncFaults";

const STATUS_ORDER = ["pending", "syncing", "failed", "dead", "synced"];

// Dev-only panel for the Sync Queue tab. Lets a developer flip sync
// fault switches and watch the queue's live state while doing it.
// Rendering this at all is gated by the caller (`{__DEV__ && ...}` in
// SyncQueueScreen.js); this component also refuses to render anything
// itself if __DEV__ is somehow false, as a second independent guard - see
// lib/syncFaults.js for why that check is not just a formality in a
// production bundle.
export default function DevSyncFaultPanel({ items }) {
  const { colors } = useTheme();
  const [faults, setFaults] = useState(() => getSyncFaults());
  const [syncing, setSyncing] = useState(isQueueSyncing());

  useEffect(() => {
    const unsubscribe = subscribeSyncFaults(setFaults);
    const interval = setInterval(() => setSyncing(isQueueSyncing()), 500);
    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  if (!__DEV__) return null;

  const counts = STATUS_ORDER.reduce((acc, status) => {
    acc[status] = items.filter((i) => i.syncStatus === status).length;
    return acc;
  }, {});

  return (
    <ScrollView style={[styles.panel, { backgroundColor: colors.background, borderColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.text }]}>DEV: Sync Fault Injection</Text>

      <Text style={[styles.sectionLabel, { color: colors.subtext }]}>Firebase project (confirm before testing)</Text>
      <Text style={[styles.projectLine, { color: FIREBASE_ENV === "prod" ? colors.red : colors.green }]}>
        {FIREBASE_ENV.toUpperCase()} - {FIREBASE_PROJECT_ID}
      </Text>
      {FIREBASE_ENV === "prod" && (
        <Text style={[styles.warning, { color: colors.red }]}>
          WARNING: this build is pointed at production. Do not flip faults or queue test events.
        </Text>
      )}

      <Text style={[styles.sectionLabel, { color: colors.subtext }]}>Lock / queue state</Text>
      <Text style={[styles.statLine, { color: colors.text }]}>syncing lock: {syncing ? "true" : "false"}</Text>
      <View style={styles.countsRow}>
        {STATUS_ORDER.map((status) => (
          <Text key={status} style={[styles.countChip, { color: colors.text, borderColor: colors.border }]}>
            {status}: {counts[status]}
          </Text>
        ))}
      </View>

      <Text style={[styles.sectionLabel, { color: colors.subtext }]}>Fault switches</Text>

      <FaultRow
        label="hangUpload"
        hint="uploadBytesResumable never resolves"
        value={faults.hangUpload}
        onChange={setHangUpload}
        colors={colors}
      />
      <FaultRow
        label="hangSetDoc"
        hint="setDoc never resolves"
        value={faults.hangSetDoc}
        onChange={setHangSetDoc}
        colors={colors}
      />
      <FaultRow
        label="failSetDoc"
        hint="setDoc rejects with fake permission-denied"
        value={faults.failSetDoc}
        onChange={setFailSetDoc}
        colors={colors}
      />
      <FaultRow
        label="hangWholeDrain"
        hint="whole drain hangs before any item - only the watchdog can clear this"
        value={faults.hangWholeDrain}
        onChange={setHangWholeDrain}
        colors={colors}
      />

      <Text style={[styles.sectionLabel, { color: colors.subtext }]}>
        Timeout override: {faults.timeoutOverrideMs ? `${faults.timeoutOverrideMs}ms` : "off (prod values)"}
      </Text>
      <View style={styles.buttonRow}>
        <TimeoutButton label="Off" active={!faults.timeoutOverrideMs} onPress={() => setTimeoutOverrideMs(null)} colors={colors} />
        <TimeoutButton label="10s" active={faults.timeoutOverrideMs === 10000} onPress={() => setTimeoutOverrideMs(10000)} colors={colors} />
        <TimeoutButton label="3s" active={faults.timeoutOverrideMs === 3000} onPress={() => setTimeoutOverrideMs(3000)} colors={colors} />
      </View>

      <TouchableOpacity style={[styles.clearButton, { borderColor: colors.red }]} onPress={clearAllSyncFaults}>
        <Text style={[styles.clearButtonText, { color: colors.red }]}>Clear all faults</Text>
      </TouchableOpacity>

      <Text style={[styles.sectionLabel, { color: colors.subtext }]}>Rows</Text>
      {items.map((item) => (
        <Text key={item.localId} style={[styles.rowLine, { color: colors.subtext }]} numberOfLines={2}>
          {item.syncStatus} attempts={item.attempts} {item.employeeName} {item.lastError ? `- ${item.lastError}` : ""}
        </Text>
      ))}
    </ScrollView>
  );
}

function FaultRow({ label, hint, value, onChange, colors }) {
  return (
    <View style={styles.faultRow}>
      <View style={styles.faultLabelWrap}>
        <Text style={[styles.faultLabel, { color: colors.text }]}>{label}</Text>
        <Text style={[styles.faultHint, { color: colors.subtext }]}>{hint}</Text>
      </View>
      <Switch value={!!value} onValueChange={onChange} />
    </View>
  );
}

function TimeoutButton({ label, active, onPress, colors }) {
  return (
    <TouchableOpacity
      style={[
        styles.timeoutButton,
        { borderColor: colors.border },
        active && { backgroundColor: colors.accent, borderColor: colors.accent },
      ]}
      onPress={onPress}
    >
      <Text style={[styles.timeoutButtonText, { color: active ? "#fff" : colors.text }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  panel: { maxHeight: 360, borderTopWidth: 1, borderBottomWidth: 1, padding: 12 },
  title: { fontSize: 13, fontWeight: "800", marginBottom: 8 },
  sectionLabel: { fontSize: 11, fontWeight: "700", marginTop: 10, marginBottom: 4, textTransform: "uppercase" },
  projectLine: { fontSize: 14, fontWeight: "800" },
  warning: { fontSize: 11, fontWeight: "700", marginTop: 4 },
  statLine: { fontSize: 12, fontWeight: "600" },
  countsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  countChip: { fontSize: 11, borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  faultRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 4 },
  faultLabelWrap: { flex: 1, marginRight: 8 },
  faultLabel: { fontSize: 12, fontWeight: "700" },
  faultHint: { fontSize: 10, marginTop: 1 },
  buttonRow: { flexDirection: "row", gap: 8 },
  timeoutButton: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  timeoutButtonText: { fontSize: 11, fontWeight: "700" },
  clearButton: { marginTop: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, alignItems: "center" },
  clearButtonText: { fontSize: 12, fontWeight: "700" },
  rowLine: { fontSize: 10, marginTop: 2 },
});
