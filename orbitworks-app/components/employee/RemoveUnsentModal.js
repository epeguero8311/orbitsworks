import { Modal, View, Text } from "react-native";
import { Feather } from "@expo/vector-icons";
import { radii, spacing, fontSizes } from "../../lib/theme";
import { useTheme } from "../../lib/ThemeContext";
import { makeStyles } from "../../lib/makeStyles";
import Button from "../ui/Button";
import { removeWarning } from "../../lib/removedReportLogic";

// RC1 follow-up: the confirm before removing an unsent punch or comment
// from the Sync tab. It is lost for good, so this says so plainly
// (removeWarning) and tells the employee their admin will be told. "Keep
// it" is the big, first button; removing takes the red one below it.
// item: the queue row ({ action: "in" | ... | "comment" }); whenLabel:
// formatWhen of its time. error: shown under the text, box stays open.
export default function RemoveUnsentModal({ item, whenLabel, busy, error, onConfirm, onCancel }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const isComment = item?.action === "comment";
  const text = removeWarning(isComment ? "comment" : "punch", item?.action, whenLabel);
  return (
    <Modal visible={!!item} transparent animationType="fade" onRequestClose={busy ? undefined : onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.box} accessibilityRole="alert">
          <Feather name="alert-triangle" size={40} color={colors.red} style={styles.icon} />
          <Text style={styles.title}>{text.title}</Text>
          <Text style={styles.message}>{text.message}</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.buttons}>
            <Button label={text.cancelLabel} tone="blue" onPress={onCancel} disabled={busy} />
            <Button label={error ? "Try again" : text.confirmLabel} tone="red" variant="outline" onPress={onConfirm} busy={busy} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((colors) => ({
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: "center", padding: spacing.xxl },
  box: { backgroundColor: colors.surface, borderRadius: radii.xl, padding: spacing.xxl, borderTopWidth: 4, borderTopColor: colors.red },
  icon: { alignSelf: "center", marginBottom: spacing.md },
  title: { fontSize: fontSizes.xl, fontWeight: "700", color: colors.red, textAlign: "center", lineHeight: 26 },
  message: { fontSize: fontSizes.md, color: colors.text, textAlign: "center", marginTop: spacing.md, lineHeight: 21 },
  error: { fontSize: fontSizes.md, color: colors.red, textAlign: "center", marginTop: spacing.md },
  buttons: { gap: spacing.md, marginTop: spacing.xxl },
}));
