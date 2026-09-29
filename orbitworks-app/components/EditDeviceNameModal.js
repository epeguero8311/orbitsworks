import { useState } from "react";
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import { useTheme } from "../lib/ThemeContext";
import { validateDeviceName, DEVICE_NAME_MAX_LENGTH } from "../lib/validators/device";

// No existing edit-modal pattern anywhere else in the app (checked) - this
// is a plain, minimal Modal + TextInput, not a shared component.
export default function EditDeviceNameModal({ visible, initialName, onSave, onCancel }) {
  const { colors } = useTheme();
  const [name, setName] = useState(initialName ?? "");
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  function handleSave() {
    const result = validateDeviceName(name);
    if (!result.valid) {
      setError(result.error);
      return;
    }
    setSaving(true);
    onSave(result.trimmed);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Text style={[styles.title, { color: colors.text }]}>Device name</Text>
          <TextInput
            autoFocus
            value={name}
            onChangeText={(text) => {
              setName(text);
              setError(null);
            }}
            placeholder="e.g. Truck 3 iPad"
            placeholderTextColor={colors.subtext}
            style={[
              styles.input,
              { borderColor: colors.border, color: colors.text, backgroundColor: colors.background },
            ]}
            maxLength={DEVICE_NAME_MAX_LENGTH}
            editable={!saving}
          />
          {error && <Text style={[styles.error, { color: colors.red }]}>{error}</Text>}

          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.button} onPress={onCancel} disabled={saving}>
              <Text style={[styles.buttonText, { color: colors.subtext }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.button} onPress={handleSave} disabled={saving}>
              <Text style={[styles.buttonText, { color: colors.accent, fontWeight: "600" }]}>
                {saving ? "Saving..." : "Save"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: { width: "100%", maxWidth: 360, borderRadius: 14, padding: 20 },
  title: { fontSize: 16, fontWeight: "600", marginBottom: 12 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  error: { fontSize: 12, marginTop: 6 },
  buttonRow: { flexDirection: "row", justifyContent: "flex-end", gap: 20, marginTop: 16 },
  button: { paddingVertical: 6, paddingHorizontal: 4 },
  buttonText: { fontSize: 15 },
});
