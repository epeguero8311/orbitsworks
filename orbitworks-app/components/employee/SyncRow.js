import { View, Text, Pressable } from "react-native";
import { radii, spacing, fontSizes } from "../../lib/theme";
import { makeStyles } from "../../lib/makeStyles";
import { ACTION_LABELS, rowAction, STATUS_LABELS, STATUS_TONES } from "../../lib/punchQueueLogic";
import ListRow from "../ui/ListRow";
import StatusPill from "../ui/StatusPill";

// One punch or comment on the Sync tab: what it was, when and a detail
// ("Today, 9:05 AM - Main St" for a punch, the start of the note for a
// comment), and its status. A Failed row also shows why, and Remove
// (Phase 5: no Redo - a failed punch can never be sent again).
export default function SyncRow({ item, whenLabel, detail, divider, onRemove }) {
  const styles = useStyles();
  const canRemove = rowAction(item) === "remove";
  const sub = detail ? `${whenLabel} - ${detail}` : whenLabel;

  return (
    <ListRow divider={divider} right={<StatusPill label={STATUS_LABELS[item.status] || item.status} tone={STATUS_TONES[item.status]} />}>
      <Text style={styles.action}>{ACTION_LABELS[item.action] || item.action}</Text>
      <Text style={styles.sub}>{sub}</Text>
      {item.status === "failed" ? (
        <View style={styles.failBox}>
          {item.failMessage ? <Text style={styles.failText}>{item.failMessage}</Text> : null}
          {canRemove ? (
            <Pressable
              style={({ pressed }) => [styles.button, pressed && styles.pressed]}
              onPress={() => onRemove(item)}
              accessibilityRole="button"
              accessibilityLabel="Remove"
            >
              <Text style={styles.buttonText}>Remove</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </ListRow>
  );
}

const useStyles = makeStyles((colors) => ({
  action: { fontSize: fontSizes.md, fontWeight: "700", color: colors.text },
  sub: { fontSize: fontSizes.sm, color: colors.subtext, marginTop: 2 },
  failBox: { marginTop: spacing.sm, gap: spacing.sm, alignItems: "flex-start" },
  failText: { fontSize: fontSizes.sm, color: colors.red },
  button: {
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.redStrong,
    paddingHorizontal: spacing.lg,
    minHeight: 34,
    justifyContent: "center",
  },
  buttonText: { fontSize: fontSizes.sm, fontWeight: "700", color: colors.redStrong },
  pressed: { opacity: 0.6 },
}));
