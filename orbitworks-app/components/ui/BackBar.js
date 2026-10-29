import { View, Text, Pressable, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";
import { lightColors as colors, spacing, fontSizes } from "../../lib/theme";

// Light top bar with an iOS-style "< Back" on the left, below the status bar,
// and an optional small centered title. No onBack hides the button (e.g.
// while a punch is sending). Android's back button is handled by the stack.
export default function BackBar({ title, onBack }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <View style={styles.row}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            style={({ pressed }) => [styles.back, pressed && styles.pressed]}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Feather name="chevron-left" size={28} color={colors.accent} />
            <Text style={styles.backText}>Back</Text>
          </Pressable>
        ) : null}
        {title ? (
          <Text style={styles.title} numberOfLines={1} pointerEvents="none">
            {title}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: colors.background },
  row: { height: 44, justifyContent: "center" },
  back: {
    position: "absolute",
    left: spacing.xs,
    zIndex: 1,
    minHeight: 44,
    minWidth: 44,
    flexDirection: "row",
    alignItems: "center",
    paddingRight: spacing.sm,
  },
  pressed: { opacity: 0.5 },
  backText: { color: colors.accent, fontSize: fontSizes.lg, marginLeft: -4 },
  title: {
    color: colors.text,
    fontSize: fontSizes.lg,
    fontWeight: "600",
    textAlign: "center",
    marginHorizontal: 96,
  },
});
