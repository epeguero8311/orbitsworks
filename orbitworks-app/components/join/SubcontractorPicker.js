import { useState } from "react";
import { View, Text, TouchableOpacity, Modal, FlatList, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// "Who do you work for?" dropdown. options = [{ id, label }], id null means
// the company itself (in-house). selected = an option id, or undefined when
// nothing is picked yet.
export default function SubcontractorPicker({ options, selected, onSelect, disabled }) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const current = options.find((o) => o.id === selected);

  return (
    <>
      <TouchableOpacity
        style={styles.field}
        onPress={() => setOpen(true)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel="Choose who you work for"
      >
        <Text style={[styles.fieldText, !current && styles.placeholder]} numberOfLines={1}>
          {current ? current.label : "Choose who you work for"}
        </Text>
        <Feather name="chevron-down" size={20} color="#6b7280" />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setOpen(false)} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
          <Text style={styles.sheetTitle}>Who do you work for?</Text>
          <FlatList
            data={options}
            keyExtractor={(o) => (o.id === null ? "__direct" : o.id)}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.option}
                onPress={() => {
                  onSelect(item.id);
                  setOpen(false);
                }}
              >
                <Text style={styles.optionText}>{item.label}</Text>
                {item.id === selected ? <Feather name="check" size={20} color="#3b6fe0" /> : null}
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: "#fff",
  },
  fieldText: { flex: 1, fontSize: 16, color: "#111", marginRight: 8 },
  placeholder: { color: "#9ca3af" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  sheet: { backgroundColor: "#fff", borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingTop: 18, maxHeight: "60%" },
  sheetTitle: { fontSize: 17, fontWeight: "700", color: "#111", paddingHorizontal: 20, marginBottom: 8 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e5e7eb",
  },
  optionText: { fontSize: 16, color: "#111", flex: 1, marginRight: 8 },
});
