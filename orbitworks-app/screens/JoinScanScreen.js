import { useCallback } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { CameraView } from "expo-camera";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import JoinTopBarButton, { JoinTopBar } from "../components/join/JoinTopBarButton";
import { useJoinScanner } from "../lib/hooks/useJoinScanner";

// Scan the crew code poster from inside the app (used after installing,
// since the token can't survive an App Store install).
export default function JoinScanScreen({ navigation }) {
  const onFound = useCallback(() => navigation.replace("JoinStart"), [navigation]);
  const { permission, requestPermission, error, onBarcodeScanned } = useJoinScanner({ onFound });
  const insets = useSafeAreaInsets();
  // Cancel (top right): back to Login. Nothing comes before the scanner.
  const cancel = <JoinTopBarButton label="Cancel" onPress={() => navigation.goBack()} accessibilityLabel="Cancel scanning" />;

  if (!permission) return <View style={styles.root} />;

  if (!permission.granted) {
    return (
      <View style={styles.white}>
        <JoinTopBar style={{ paddingTop: insets.top + 8 }} right={cancel} />
        <View style={styles.center}>
          <Text style={styles.title}>Camera needed</Text>
          <Text style={styles.body}>Allow the camera to scan your crew code.</Text>
          <TouchableOpacity style={styles.button} onPress={requestPermission}>
            <Text style={styles.buttonText}>Allow camera</Text>
          </TouchableOpacity>
        </View>
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
      <JoinTopBar style={[styles.overBar, { paddingTop: insets.top + 8 }]} right={cancel} />
      <View style={styles.overlay}>
        <Text style={styles.hint}>Point the camera at your crew code</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  white: { flex: 1, backgroundColor: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28 },
  overBar: { position: "absolute", left: 0, right: 0, top: 0 },
  title: { fontSize: 20, fontWeight: "700", color: "#111", marginBottom: 8 },
  body: { fontSize: 15, color: "#374151", textAlign: "center", marginBottom: 20 },
  overlay: { position: "absolute", left: 24, right: 24, bottom: 48, alignItems: "center" },
  hint: { color: "#fff", fontSize: 16, fontWeight: "600", marginBottom: 12, textAlign: "center" },
  error: { color: "#fecaca", fontSize: 14, marginBottom: 12, textAlign: "center" },
  button: { backgroundColor: "#3b6fe0", borderRadius: 999, paddingVertical: 14, paddingHorizontal: 40 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
