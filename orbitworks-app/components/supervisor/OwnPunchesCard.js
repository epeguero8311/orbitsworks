import { View, Text } from "react-native";
import { spacing, fontSizes, radii } from "../../lib/theme";
import { makeStyles } from "../../lib/makeStyles";
import { useTheme } from "../../lib/ThemeContext";
import { ACTION_LABELS } from "../../lib/punchQueueLogic";

// RC1: the signed-in supervisor/admin's OWN punches saved while they were
// an Employee App login, still not on the server. They keep sending in
// the background (the server accepts them from the new role, RC1 C).
// Read-only: a punch that can't sync shows why and to tell the admin -
// there is no Remove here.
const STATUS = {
  waiting: { label: "Waiting", tone: "subtext" },
  syncing: { label: "Syncing", tone: "accent" },
  failed: { label: "Couldn't sync", tone: "red" },
};

function formatTime(ms) {
  if (!ms) return "";
  const d = new Date(ms);
  return d.toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
}

export default function OwnPunchesCard({ items }) {
  const styles = useStyles();
  const { colors } = useTheme();
  if (!items || items.length === 0) return null;
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Your own punches from the Employee App</Text>
      <Text style={styles.sub}>Saved before your role changed. They keep sending on their own.</Text>
      {items.map((item) => {
        const status = STATUS[item.status] ?? STATUS.waiting;
        return (
          <View key={item.requestId} style={styles.row}>
            <View style={styles.rowMain}>
              <Text style={styles.action}>{ACTION_LABELS[item.action] ?? "Punch"}</Text>
              <Text style={styles.when}>{formatTime(item.queuedAtMs)}</Text>
            </View>
            <Text style={[styles.status, { color: colors[status.tone] }]}>{status.label}</Text>
            {item.status === "failed" ? (
              <Text style={styles.failed}>{item.failMessage || "This punch can't be sent. Tell your admin so they can fix your time."}</Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  title: { fontSize: fontSizes.md, fontWeight: "700", color: colors.text },
  sub: { fontSize: fontSizes.sm, color: colors.subtext, marginTop: spacing.xs, marginBottom: spacing.sm },
  row: { paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  rowMain: { flexDirection: "row", justifyContent: "space-between" },
  action: { fontSize: fontSizes.md, color: colors.text, fontWeight: "600" },
  when: { fontSize: fontSizes.sm, color: colors.subtext },
  status: { fontSize: fontSizes.sm, fontWeight: "600", marginTop: 2 },
  failed: { fontSize: fontSizes.sm, color: colors.red, marginTop: 2 },
}));
