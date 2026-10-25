import { TouchableOpacity, View, Text, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";

// A required consent tick box. Starts unchecked; the parent owns the state.
export default function ConsentCheckbox({ checked, onToggle, children, disabled }) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onToggle}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled: !!disabled }}
      activeOpacity={0.7}
    >
      <View style={[styles.box, checked && styles.boxChecked]}>
        {checked ? <Feather name="check" size={16} color="#fff" /> : null}
      </View>
      <View style={styles.label}>{children}</View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 10 },
  box: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#9ca3af",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    marginTop: 1,
  },
  boxChecked: { backgroundColor: "#3b6fe0", borderColor: "#3b6fe0" },
  label: { flex: 1 },
});

export const consentTextStyle = StyleSheet.create({ text: { fontSize: 15, color: "#111", lineHeight: 21 } }).text;
