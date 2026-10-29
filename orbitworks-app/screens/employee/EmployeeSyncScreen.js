import { View, Text, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { lightColors as colors, radii, spacing, fontSizes } from "../../lib/theme";
import { MOCK_SYNC_STATE, MOCK_QUEUED_ITEMS } from "../../lib/mockData";
import TabPage from "../../components/ui/TabPage";
import ListRow from "../../components/ui/ListRow";

// Employee App Sync tab - LAYOUT ONLY, mock data (lib/mockData.js).
// Online: "Everything is synced". Offline: the queued punches.
export default function EmployeeSyncScreen() {
  const online = MOCK_SYNC_STATE === "online";
  const items = online ? [] : MOCK_QUEUED_ITEMS;

  return (
    <TabPage title="Sync" fill={online}>
      <View style={styles.statusRow}>
        <View style={styles.status}>
          <View style={[styles.dot, { backgroundColor: online ? colors.green : colors.orange }]} />
          <Text style={styles.statusText}>{online ? "Online" : "Offline"}</Text>
        </View>
        <Pressable
          style={({ pressed }) => [styles.syncButton, pressed && styles.pressed]}
          onPress={() => {}}
          accessibilityRole="button"
          accessibilityLabel="Sync Now"
        >
          <Text style={styles.syncButtonText}>Sync Now</Text>
        </Pressable>
      </View>

      {online ? (
        <View style={styles.center}>
          <Feather name="check-circle" size={72} color={colors.greenStrong} />
          <Text style={styles.syncedText}>Everything is synced</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {items.map((item, i) => (
            <ListRow
              key={item.id}
              divider={i < items.length - 1}
              right={
                <View style={styles.queued}>
                  <View style={[styles.smallDot, { backgroundColor: colors.orange }]} />
                  <Text style={styles.queuedText}>Queued</Text>
                </View>
              }
            >
              <Text style={styles.action}>{item.action}</Text>
              <Text style={styles.sub}>
                {item.employeeName} · {item.time}
              </Text>
            </ListRow>
          ))}
        </View>
      )}
    </TabPage>
  );
}

const styles = StyleSheet.create({
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
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.lg },
  syncedText: { fontSize: fontSizes.lg, fontWeight: "600", color: colors.text },
  list: { marginTop: spacing.xs },
  action: { fontSize: fontSizes.md, fontWeight: "700", color: colors.text },
  sub: { fontSize: fontSizes.sm, color: colors.subtext, marginTop: 2 },
  queued: { flexDirection: "row", alignItems: "center", gap: 6 },
  smallDot: { width: 8, height: 8, borderRadius: 4 },
  queuedText: { fontSize: fontSizes.sm, fontWeight: "600", color: colors.orangeText },
});
