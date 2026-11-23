import { View, StyleSheet } from "react-native";
import { spacing } from "../../lib/theme";
import Button from "../ui/Button";

const BUTTONS = {
  clockIn: { label: "Clock in", tone: "green", variant: "solid" },
  clockBackIn: { label: "Clock back in", tone: "green", variant: "solid" },
  startBreak: { label: "START BREAK", tone: "blue", variant: "outline" },
  clockOut: { label: "Clock out", tone: "red", variant: "solid" },
  endBreak: { label: "End Break", tone: "orange", variant: "solid" },
};

// Employee Home main buttons, stacked full width. `buttons` comes from
// buttonsFor() in lib/employeeHome.js - empty for an inactive employee.
export default function ClockButtons({ buttons, onPress, disabled }) {
  return (
    <View style={styles.column}>
      {buttons.map((key) => {
        const b = BUTTONS[key];
        if (!b) return null;
        return (
          <Button
            key={key}
            label={b.label}
            tone={b.tone}
            variant={b.variant}
            onPress={() => onPress(key)}
            disabled={disabled}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: spacing.md },
});
