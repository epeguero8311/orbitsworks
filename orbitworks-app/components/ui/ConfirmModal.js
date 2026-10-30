import { Modal, View, Text } from "react-native";
import { radii, spacing, fontSizes } from "../../lib/theme";
import { makeStyles } from "../../lib/makeStyles";
import Button from "./Button";

// Dimmed backdrop with a centered white box: a question, a colored confirm
// button and an outlined blue Cancel. message: an optional plain line under
// the question. An error shows under the question and the box stays open,
// with the confirm button reading "Try again".
export default function ConfirmModal({
  visible,
  title,
  message,
  confirmLabel,
  confirmTone = "blue",
  cancelLabel = "Cancel",
  error,
  busy,
  onConfirm,
  onCancel,
}) {
  const styles = useStyles();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={busy ? undefined : onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.box}>
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.buttons}>
            <Button label={error ? "Try again" : confirmLabel} tone={confirmTone} onPress={onConfirm} busy={busy} />
            <Button label={cancelLabel} tone="blue" variant="outline" onPress={onCancel} disabled={busy} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((colors) => ({
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: "center", padding: spacing.xxl },
  box: { backgroundColor: colors.surface, borderRadius: radii.xl, padding: spacing.xxl },
  title: { fontSize: fontSizes.xl, fontWeight: "700", color: colors.text, textAlign: "center", lineHeight: 26 },
  message: { fontSize: fontSizes.md, color: colors.text, textAlign: "center", marginTop: spacing.md, lineHeight: 21 },
  error: { fontSize: fontSizes.md, color: colors.red, textAlign: "center", marginTop: spacing.md },
  buttons: { gap: spacing.md, marginTop: spacing.xxl },
}));
