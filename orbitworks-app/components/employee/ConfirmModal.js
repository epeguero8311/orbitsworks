import { Modal, View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useTheme } from "../../lib/ThemeContext";
import Spinner from "../Spinner";

// Small yes/no sheet (break start/end). Shows the error under the question
// and keeps it open so "Try again" resends the same tap.
export default function ConfirmModal({ visible, title, confirmLabel, error, busy, onConfirm, onCancel }) {
  const { colors } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: colors.background }]}>
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          {error ? <Text style={[styles.error, { color: colors.red }]}>{error}</Text> : null}
          <View style={styles.row}>
            <TouchableOpacity style={[styles.button, { borderColor: colors.border }]} onPress={onCancel} disabled={busy}>
              <Text style={[styles.cancelText, { color: colors.text }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, { backgroundColor: colors.accent, borderColor: colors.accent }]}
              onPress={onConfirm}
              disabled={busy}
            >
              {busy ? <Spinner size={18} color="#fff" /> : <Text style={styles.confirmText}>{error ? "Try again" : confirmLabel}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 24 },
  sheet: { borderRadius: 16, padding: 20 },
  title: { fontSize: 18, fontWeight: "700", textAlign: "center" },
  error: { fontSize: 14, textAlign: "center", marginTop: 10 },
  row: { flexDirection: "row", gap: 12, marginTop: 20 },
  button: { flex: 1, borderRadius: 12, borderWidth: 1, paddingVertical: 14, alignItems: "center" },
  cancelText: { fontSize: 16, fontWeight: "600" },
  confirmText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
