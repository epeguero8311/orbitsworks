import { useRef } from "react";
import { View, TextInput, Text, StyleSheet } from "react-native";

// Birthday as three number boxes: MM / DD / YYYY. Filling a box jumps to
// the next; backspace in an empty box jumps back. value = { mm, dd, yyyy }.
export default function BirthdayBoxes({ value, onChange, editable = true }) {
  const ddRef = useRef(null);
  const yyyyRef = useRef(null);
  const mmRef = useRef(null);

  const digits = (t) => t.replace(/[^0-9]/g, "");

  const setPart = (part, text, max, next) => {
    const clean = digits(text).slice(0, max);
    onChange({ ...value, [part]: clean });
    if (clean.length === max && next && next.current) next.current.focus();
  };

  const backTo = (prev, current) => ({ nativeEvent }) => {
    if (nativeEvent.key === "Backspace" && current.length === 0 && prev && prev.current) prev.current.focus();
  };

  return (
    <View style={styles.row}>
      <TextInput
        ref={mmRef}
        style={[styles.box, styles.small]}
        value={value.mm}
        onChangeText={(t) => setPart("mm", t, 2, ddRef)}
        placeholder="MM"
        placeholderTextColor="#9ca3af"
        keyboardType="number-pad"
        maxLength={2}
        editable={editable}
        accessibilityLabel="Birth month"
        returnKeyType="next"
      />
      <Text style={styles.slash}>/</Text>
      <TextInput
        ref={ddRef}
        style={[styles.box, styles.small]}
        value={value.dd}
        onChangeText={(t) => setPart("dd", t, 2, yyyyRef)}
        onKeyPress={backTo(mmRef, value.dd)}
        placeholder="DD"
        placeholderTextColor="#9ca3af"
        keyboardType="number-pad"
        maxLength={2}
        editable={editable}
        accessibilityLabel="Birth day"
        returnKeyType="next"
      />
      <Text style={styles.slash}>/</Text>
      <TextInput
        ref={yyyyRef}
        style={[styles.box, styles.year]}
        value={value.yyyy}
        onChangeText={(t) => setPart("yyyy", t, 4, null)}
        onKeyPress={backTo(ddRef, value.yyyy)}
        placeholder="YYYY"
        placeholderTextColor="#9ca3af"
        keyboardType="number-pad"
        maxLength={4}
        editable={editable}
        accessibilityLabel="Birth year"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  box: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    paddingVertical: 12,
    fontSize: 17,
    color: "#111",
    textAlign: "center",
    backgroundColor: "#fff",
  },
  small: { width: 64 },
  year: { width: 92 },
  slash: { fontSize: 20, color: "#9ca3af", marginHorizontal: 8 },
});
