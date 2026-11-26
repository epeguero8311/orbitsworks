import { Modal, View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useTheme } from "../../lib/ThemeContext";
import Spinner from "../Spinner";

// Task 5 v2 (5): shown BEFORE the account is created. Only [OK] - no
// auto-close, no tap-outside. Pressing OK creates the account.
export default function NewPinModal({ visible, pin, busy, onOk }) {
  const { colors } = useTheme();
  return (
    <Modal visible={visible} animationType="fade" transparent supportedOrientations={["portrait", "landscape"]} onRequestClose={() => {}}>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Text style={[styles.label, { color: colors.subtext }]}>Your PIN</Text>
          <Text style={[styles.pin, { color: colors.text }]} accessibilityLabel={`Your PIN: ${String(pin || "").split("").join(" ")}`}>
            {pin}
          </Text>
          <Text style={[styles.body, { color: colors.text }]}>
            Take a picture or write down your PIN. It can&apos;t be shown again.
          </Text>
          <TouchableOpacity style={[styles.ok, { backgroundColor: colors.accent }, busy && styles.dim]} onPress={onOk} disabled={busy}>
            {busy ? <Spinner size={20} color="#fff" /> : <Text style={styles.okText}>OK</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", alignItems: "center", padding: 24 },
  card: { width: "100%", maxWidth: 420, borderRadius: 20, padding: 28, alignItems: "center" },
  label: { fontSize: 15, fontWeight: "600" },
  pin: { fontSize: 56, fontWeight: "800", letterSpacing: 12, marginVertical: 12, fontVariant: ["tabular-nums"] },
  body: { fontSize: 16, textAlign: "center", lineHeight: 22 },
  ok: { marginTop: 24, alignSelf: "stretch", borderRadius: 14, paddingVertical: 16, alignItems: "center" },
  okText: { color: "#fff", fontSize: 17, fontWeight: "700" },
  dim: { opacity: 0.6 },
});
