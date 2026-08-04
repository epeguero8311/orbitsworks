import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useAuth } from "../lib/AuthContext";
import { findEmployeeByPin } from "../lib/clockLogic";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];

export default function PinEntryScreen({ navigation }) {
  const { userData } = useAuth();
  const [pin, setPin] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  const handleKeyPress = async (key) => {
    if (checking) return;
    setError("");

    if (key === "del") {
      setPin((p) => p.slice(0, -1));
      return;
    }
    if (key === "") return;

    const next = pin + key;
    setPin(next);

    if (next.length === 4) {
      setChecking(true);
      const employee = await findEmployeeByPin(userData.companyId, next);
      setChecking(false);

      if (!employee) {
        setError("PIN not recognized");
        setPin("");
        return;
      }

      navigation.navigate("ClockCamera", { employee });
      setPin("");
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Enter your PIN</Text>

      <View style={styles.dotsRow}>
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            style={[styles.dot, i < pin.length && styles.dotFilled]}
          />
        ))}
      </View>

      {checking && <ActivityIndicator style={{ marginTop: 12 }} color="#3b6fe0" />}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.keypad}>
        {KEYS.map((key, i) => (
          <TouchableOpacity
            key={i}
            style={[styles.key, key === "" && styles.keyHidden]}
            onPress={() => handleKeyPress(key)}
            disabled={key === ""}
          >
            <Text style={styles.keyText}>{key === "del" ? "⌫" : key}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Text style={styles.cancel}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", alignItems: "center", paddingTop: 80 },
  title: { fontSize: 20, fontWeight: "700", color: "#111", marginBottom: 24 },
  dotsRow: { flexDirection: "row", marginBottom: 8 },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ccc",
    marginHorizontal: 8,
  },
  dotFilled: { backgroundColor: "#3b6fe0", borderColor: "#3b6fe0" },
  error: { color: "#ef4444", marginTop: 12 },
  keypad: {
    flexDirection: "row",
    flexWrap: "wrap",
    width: 280,
    marginTop: 32,
    justifyContent: "center",
  },
  key: {
    width: 80,
    height: 80,
    justifyContent: "center",
    alignItems: "center",
  },
  keyHidden: { opacity: 0 },
  keyText: { fontSize: 26, fontWeight: "600", color: "#111" },
  cancel: { color: "#666", marginTop: 32, fontSize: 15 },
});
