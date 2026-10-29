import { Modal, View, Text, StyleSheet } from "react-native";
import { lightColors as colors, radii, spacing, fontSizes } from "../../lib/theme";
import Button from "./Button";

// Dimmed backdrop with a centered white box: a question, a colored confirm
// button and an outlined blue Cancel. An error shows under the question and
// the box stays open, with the confirm button reading "Try again".
export default function ConfirmModal({
  visible,
  title,
  confirmLabel,
  confirmTone = "blue",
  cancelLabel = "Cancel",
  error,
  busy,
  onConfirm,
  onCancel,
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={busy ? undefined : onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.box}>
          <Text style={styles.title}>{title}</Text>
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

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: "center", padding: spacing.xxl },
  box: { backgroundColor: colors.surface, borderRadius: radii.xl, padding: spacing.xxl },
  title: { fontSize: fontSizes.xl, fontWeight: "700", color: colors.text, textAlign: "center", lineHeight: 26 },
  error: { fontSize: fontSizes.md, color: colors.red, textAlign: "center", marginTop: spacing.md },
  buttons: { gap: spacing.md, marginTop: spacing.xxl },
});
