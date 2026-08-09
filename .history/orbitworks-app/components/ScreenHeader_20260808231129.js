import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../lib/ThemeContext";
import Logo from "./Logo";

export default function ScreenHeader({ title, onBack, right }) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.container,
        { borderBottomColor: colors.border, backgroundColor: colors.background },
      ]}
    >
      {onBack ? (
        <TouchableOpacity
          onPress={onBack}
          style={styles.side}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Feather name="arrow-left" size={24} color={colors.text} />
        </TouchableOpacity>
      ) : (
        <View style={styles.side} />
      )}
      <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.side}>{right ?? <Logo size={20} />}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 56,
    paddingBottom: 14,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
  },
  side: { width: 40, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontSize: 17, fontWeight: "700", textAlign: "center" },
});
