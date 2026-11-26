import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../../lib/ThemeContext";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];

// 4-digit PIN pad for the Employee App clock in/out. Shows dots only - the
// digits are never drawn on screen. disabled while locked or sending.
// scale (default 1): the Kiosk draws it 1.4x (keys, digits, dots) for a
// wall iPad (iPad round 1); everything else stays the same size.
export default function PinPad({ length, onDigit, onDelete, disabled, scale = 1 }) {
  const { colors } = useTheme();
  const z = scale === 1 ? null : scaledStyles(scale);
  return (
    <View style={styles.wrap}>
      <View style={[styles.dotsRow, z?.dotsRow]}>
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            style={[
              styles.dot,
              z?.dot,
              { borderColor: colors.border },
              i < length && { backgroundColor: colors.accent, borderColor: colors.accent },
            ]}
          />
        ))}
      </View>
      <View style={[styles.keypad, z?.keypad, disabled && styles.disabled]}>
        {KEYS.map((key, i) => (
          <TouchableOpacity
            key={i}
            style={[styles.key, z?.key, key === "" && styles.hidden]}
            onPress={() => (key === "del" ? onDelete() : onDigit(key))}
            disabled={disabled || key === ""}
            accessibilityLabel={key === "del" ? "Delete" : key}
          >
            {key === "del" ? (
              <Feather name="delete" size={Math.round(26 * scale)} color={colors.text} />
            ) : (
              <Text style={[styles.keyText, z?.keyText, { color: colors.text }]}>{key}</Text>
            )}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// The base sizes below times `scale` (cached per scale).
const scaledCache = new Map();
function scaledStyles(k) {
  if (!scaledCache.has(k)) {
    const r = (n) => Math.round(n * k);
    scaledCache.set(
      k,
      StyleSheet.create({
        dotsRow: { marginBottom: r(8) },
        dot: { width: r(16), height: r(16), borderRadius: r(8), marginHorizontal: r(8), borderWidth: 1.5 },
        keypad: { width: r(280), marginTop: r(24) },
        key: { width: r(80), height: r(72) },
        keyText: { fontSize: r(26) },
      })
    );
  }
  return scaledCache.get(k);
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
