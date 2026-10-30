import { View, Text, Pressable } from "react-native";
import { radii, spacing, fontSizes } from "../../lib/theme";
import { makeStyles } from "../../lib/makeStyles";
import { ACTION_LABELS, rowAction, STATUS_LABELS, STATUS_TONES } from "../../lib/punchQueueLogic";
import ListRow from "../ui/ListRow";
import StatusPill from "../ui/StatusPill";

const ACTION_BUTTONS = { redo: "Redo", remove: "Remove" };

// One punch on the Sync tab: what it was, when and where ("Today, 9:05 AM
// - Main St"), and its status. A Failed row also shows why, and the one
// action that fits: Redo (wrong PIN) or Remove (can't be recorded).
export default function SyncRow({ item, whenLabel, siteName, divider, onRedo, onRemove }) {
  const styles = useStyles();
  const action = rowAction(item);
  const onAction = action === "redo" ? onRedo : onRemove;
  const sub = siteName ? `${whenLabel} - ${siteName}` : whenLabel;

  return (
    <ListRow divider={divider} right={<StatusPill label={STATUS_LABELS[item.status] || item.status} tone={STATUS_TONES[item.status]} />}>
      <Text style={styles.action}>{ACTION_LABELS[item.action] || item.action}</Text>
      <Text style={styles.sub}>{sub}</Text>
      {item.status === "failed" ? (
        <View style={styles.failBox}>
          {item.failMessage ? <Text style={styles.failText}>{item.failMessage}</Text> : null}
          {action ? (
            <Pressable
              style={({ pressed }) => [styles.button, action === "remove" && styles.removeButton, pressed && styles.pressed]}
              onPress={() => onAction(item)}
              accessibilityRole="button"
              accessibilityLabel={ACTION_BUTTONS[action]}
            >
              <Text style={[styles.buttonText, action === "remove" && styles.removeText]}>{ACTION_BUTTONS[action]}</Text>
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
    borderColor: colors.accent,
    paddingHorizontal: spacing.lg,
    minHeight: 34,
    justifyContent: "center",
  },
  removeButton: { borderColor: colors.redStrong },
  buttonText: { fontSize: fontSizes.sm, fontWeight: "700", color: colors.accent },
  removeText: { color: colors.redStrong },
  pressed: { opacity: 0.6 },
}));
