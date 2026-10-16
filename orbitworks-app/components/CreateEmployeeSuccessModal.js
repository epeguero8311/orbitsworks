import { Modal, View, Text, Image, TouchableOpacity, StyleSheet } from "react-native";
import { useTheme } from "../lib/ThemeContext";

// Only ever dismissed via the "Got it, close" button (onRequestClose is a
// no-op) - the PIN is never shown or stored anywhere in the app again after
// this closes, per spec, so an accidental swipe/back dismiss must not be
// possible to trigger without the person consciously acknowledging it.
export default function CreateEmployeeSuccessModal({ visible, name, pin, photoUri, offline, onClose }) {
  const { colors } = useTheme();
  const digits = (pin ?? "").split("");

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          {photoUri && <Image source={{ uri: photoUri }} style={styles.photo} />}
          <Text style={[styles.name, { color: colors.text }]}>{name}</Text>

          <View style={styles.pinRow}>
            {digits.map((digit, i) => (
              <View key={i} style={[styles.digitBox, { borderColor: colors.accent }]}>
                <Text style={[styles.digitText, { color: colors.accent }]}>{digit}</Text>
              </View>
            ))}
          </View>

          <Text style={[styles.warning, { color: colors.text }]}>
            Write this PIN down. Once you close this, it can&apos;t be shown again. If it&apos;s
            lost, contact your admin to reset it.
          </Text>

          {offline && (
            <Text style={[styles.offlineNote, { color: colors.subtext }]}>
              Saved offline, will sync when connected.
            </Text>
          )}

          <TouchableOpacity style={[styles.button, { backgroundColor: colors.accent }]} onPress={onClose}>
            <Text style={styles.buttonText}>Got it, close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: { width: "100%", maxWidth: 380, borderRadius: 20, padding: 24, alignItems: "center" },
  photo: { width: 72, height: 72, borderRadius: 36, marginBottom: 12 },
  name: { fontSize: 17, fontWeight: "700", marginBottom: 18 },
  pinRow: { flexDirection: "row", gap: 10, marginBottom: 18 },
  digitBox: {
    width: 44, height: 56, borderRadius: 10, borderWidth: 2,
    alignItems: "center", justifyContent: "center",
  },
  digitText: { fontSize: 26, fontWeight: "800" },
  warning: { fontSize: 13, textAlign: "center", lineHeight: 19, marginBottom: 10 },
  offlineNote: { fontSize: 12, textAlign: "center", marginBottom: 14 },
  button: { alignSelf: "stretch", borderRadius: 14, paddingVertical: 16, alignItems: "center", marginTop: 4 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
