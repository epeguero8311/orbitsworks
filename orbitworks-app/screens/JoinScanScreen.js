import { useCallback } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { CameraView } from "expo-camera";
import { useJoinScanner } from "../lib/hooks/useJoinScanner";

// Scan the crew code poster from inside the app (used after installing,
// since the token can't survive an App Store install).
export default function JoinScanScreen({ navigation }) {
  const onFound = useCallback(() => navigation.replace("JoinStart"), [navigation]);
  const { permission, requestPermission, error, onBarcodeScanned } = useJoinScanner({ onFound });

  if (!permission) return <View style={styles.root} />;

  if (!permission.granted) {
    return (
      <View style={[styles.root, styles.center]}>
        <Text style={styles.title}>Camera needed</Text>
        <Text style={styles.body}>Allow the camera to scan your crew code.</Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Allow camera</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.link}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={onBarcodeScanned}
      />
      <View style={styles.overlay}>
        <Text style={styles.hint}>Point the camera at your crew code</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <TouchableOpacity style={styles.button} onPress={() => navigation.goBack()}>
          <Text style={styles.buttonText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  center: { alignItems: "center", justifyContent: "center", padding: 28, backgroundColor: "#fff" },
  title: { fontSize: 20, fontWeight: "700", color: "#111", marginBottom: 8 },
  body: { fontSize: 15, color: "#374151", textAlign: "center", marginBottom: 20 },
  overlay: { position: "absolute", left: 24, right: 24, bottom: 48, alignItems: "center" },
  hint: { color: "#fff", fontSize: 16, fontWeight: "600", marginBottom: 12, textAlign: "center" },
  error: { color: "#fecaca", fontSize: 14, marginBottom: 12, textAlign: "center" },
  button: { backgroundColor: "#3b6fe0", borderRadius: 999, paddingVertical: 14, paddingHorizontal: 40 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  link: { color: "#3b6fe0", fontSize: 14, fontWeight: "500", marginTop: 18 },
});
