import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useTheme } from "../../lib/ThemeContext";

const LABELS = {
  clockIn: "Clock In",
  clockBackIn: "Clock Back In",
  clockOut: "Clock Out",
  startBreak: "Start Break",
  endBreak: "End Break",
};

// Employee Home main buttons. `buttons` comes from buttonsFor() in
// lib/employeeHome.js - empty for an inactive employee.
export default function ClockButtons({ buttons, onPress, disabled }) {
  const { colors } = useTheme();
  const colorFor = (key) => {
    if (key === "clockOut") return colors.red;
    if (key === "startBreak" || key === "endBreak") return "#f59e0b";
    return colors.accent;
  };

  return (
    <View style={styles.column}>
      {buttons.map((key) => (
        <TouchableOpacity
          key={key}
          style={[styles.button, { backgroundColor: colorFor(key) }, disabled && styles.disabled]}
          onPress={() => onPress(key)}
          disabled={disabled}
          accessibilityRole="button"
        >
          <Text style={styles.text}>{LABELS[key]}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: 12 },
  button: { borderRadius: 14, paddingVertical: 18, alignItems: "center" },
  disabled: { opacity: 0.6 },
  text: { color: "#fff", fontSize: 18, fontWeight: "700" },
});
