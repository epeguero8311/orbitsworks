import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../../lib/ThemeContext";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];

// 4-digit PIN pad for the Employee App clock in/out. Shows dots only - the
// digits are never drawn on screen. disabled while locked or sending.
export default function PinPad({ length, onDigit, onDelete, disabled }) {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap}>
      <View style={styles.dotsRow}>
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            style={[
              styles.dot,
              { borderColor: colors.border },
              i < length && { backgroundColor: colors.accent, borderColor: colors.accent },
            ]}
          />
        ))}
      </View>
      <View style={[styles.keypad, disabled && styles.disabled]}>
        {KEYS.map((key, i) => (
          <TouchableOpacity
            key={i}
            style={[styles.key, key === "" && styles.hidden]}
            onPress={() => (key === "del" ? onDelete() : onDigit(key))}
            disabled={disabled || key === ""}
            accessibilityLabel={key === "del" ? "Delete" : key}
          >
            {key === "del" ? (
              <Feather name="delete" size={26} color={colors.text} />
            ) : (
              <Text style={[styles.keyText, { color: colors.text }]}>{key}</Text>
            )}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center" },
  dotsRow: { flexDirection: "row", marginBottom: 8 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 1, marginHorizontal: 8 },
  keypad: { flexDirection: "row", flexWrap: "wrap", width: 280, marginTop: 24, justifyContent: "center" },
  disabled: { opacity: 0.35 },
  key: { width: 80, height: 72, justifyContent: "center", alignItems: "center" },
  hidden: { opacity: 0 },
  keyText: { fontSize: 26, fontWeight: "600" },
});
