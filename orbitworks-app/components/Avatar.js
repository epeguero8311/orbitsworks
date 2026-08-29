import { useState } from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import { useTheme } from "../lib/ThemeContext";

// Shows the employee photo when there is one and it loads successfully.
// Falls back to a colored circle with their first initial in two cases:
// no photoUrl at all, or a photoUrl that fails to load - which is
// exactly what happens when a device is offline and cannot reach a
// remote image it does not have cached.
export default function Avatar({ name, photoUrl, size = 44 }) {
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  const initial = (name || "?").trim().charAt(0).toUpperCase();

  if (photoUrl && !failed) {
    return (
      <Image
        source={{ uri: photoUrl }}
        style={[styles.image, { width: size, height: size, borderRadius: size / 2 }]}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <View
      style={[
        styles.fallback,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.accent },
      ]}
    >
      <Text style={[styles.initial, { fontSize: size * 0.42 }]}>{initial}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: { backgroundColor: "#e5e7eb" },
  fallback: { justifyContent: "center", alignItems: "center" },
  initial: { color: "#fff", fontWeight: "700" },
});