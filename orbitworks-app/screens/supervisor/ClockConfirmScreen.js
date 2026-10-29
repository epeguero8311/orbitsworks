import { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";

export default function ClockConfirmScreen({ route, navigation }) {
  const { employeeName, resultType } = route.params;

  useEffect(() => {
    const timer = setTimeout(() => {
      navigation.popToTop();
    }, 1600);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.checkCircle}>
        <Text style={styles.checkMark}>✓</Text>
      </View>
      <Text style={styles.name}>{employeeName}</Text>
      <Text style={styles.status}>
        {resultType === "in" ? "Clocked In" : "Clocked Out"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", justifyContent: "center", alignItems: "center" },
  checkCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#22c55e",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
  },
  checkMark: { color: "#fff", fontSize: 48, fontWeight: "700" },
  name: { fontSize: 20, fontWeight: "700", color: "#111" },
  status: { fontSize: 16, color: "#666", marginTop: 6 },
});
