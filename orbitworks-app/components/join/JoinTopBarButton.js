import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

// The join flow's top-bar buttons (Back / Cancel): the app's filled blue
// button, sized for a top bar. Used on every join screen (scanner, crew
// code check, sign-up steps, selfie) so they all look the same.
export const JOIN_BLUE = "#3b6fe0";

export default function JoinTopBarButton({ label, onPress, disabled = false, accessibilityLabel }) {
  return (
    <TouchableOpacity
      style={[styles.button, disabled && styles.disabled]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityState={{ disabled }}
    >
      <Text style={styles.text}>{label}</Text>
    </TouchableOpacity>
  );
}

// Row with a left slot, a middle, and a right slot. The two slots are the
// same width, so the middle stays centered when one side is empty. style
// adds the screen's own padding (safe area) or positioning (over a camera).
export function JoinTopBar({ left = null, center = null, right = null, style }) {
  return (
    <View style={[styles.bar, style]}>
      <View style={styles.slot}>{left}</View>
      <View style={styles.center}>{center}</View>
      <View style={[styles.slot, styles.slotRight]}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 8 },
  slot: { minWidth: 92, flexDirection: "row" },
  slotRight: { justifyContent: "flex-end" },
  center: { flex: 1, alignItems: "center" },
  button: { backgroundColor: JOIN_BLUE, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 18, alignItems: "center" },
  disabled: { opacity: 0.45 },
  text: { color: "#fff", fontSize: 15, fontWeight: "600" },
});
