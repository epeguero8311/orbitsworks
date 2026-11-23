import { useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Linking } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Spinner from "../Spinner";
import JoinTopBarButton, { JoinTopBar } from "./JoinTopBarButton";
import { selfieTooLarge } from "../../lib/validators/joinSignup";

// Live selfie for sign-up: front camera only, no photo library. Rendered
// full screen (never inside a ScrollView - the preview goes black on
// Android there, see CreateEmployeeScreen). quality 0.5 is the same as
// ClockCameraScreen, whose photos already go through Rekognition, and keeps
// a phone selfie well under joinCompany's 4 MB cap.
// onCaptured({ uri, base64 }) - the photo is never logged.
// Back (top left) = onCancel: back to sign-up Step 2, everything kept.
export default function SelfieCamera({ onCaptured, onCancel }) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState(null);
  const insets = useSafeAreaInsets();

  if (!permission) return <View style={styles.black} />;

  const backButton = <JoinTopBarButton label="Back" onPress={onCancel} disabled={capturing} accessibilityLabel="Back to sign-up" />;

  if (!permission.granted) {
    return (
      <View style={styles.white}>
        <JoinTopBar style={{ paddingTop: insets.top + 8 }} left={backButton} />
        <View style={styles.center}>
          <Text style={styles.title}>Camera needed</Text>
          <Text style={styles.body}>Allow the camera to take your selfie. It becomes the photo used to check it's you when you clock in.</Text>
          {permission.canAskAgain ? (
            <TouchableOpacity style={styles.button} onPress={requestPermission}>
              <Text style={styles.buttonText}>Allow camera</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.button} onPress={() => Linking.openSettings()}>
              <Text style={styles.buttonText}>Open Settings</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  async function snap() {
    if (!cameraRef.current || capturing || !ready) return;
    setCapturing(true);
    setError(null);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.5, base64: true, exif: false });
      if (!photo || !photo.base64) {
        setError("That photo didn't work. Try again.");
      } else if (selfieTooLarge(photo.base64)) {
        setError("That photo is too large. Try again.");
      } else {
        onCaptured({ uri: photo.uri, base64: photo.base64 });
      }
    } catch {
      setError("That photo didn't work. Try again.");
    } finally {
      setCapturing(false);
    }
  }

  return (
    <View style={styles.black}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="front" onCameraReady={() => setReady(true)} />
      <JoinTopBar style={[styles.overBar, { paddingTop: insets.top + 8 }]} left={backButton} />
      <View style={[styles.top, { top: insets.top + 64 }]}>
        <Text style={styles.hint}>Face the camera, in good light, nothing covering your face.</Text>
      </View>
      <View style={[styles.bottom, { paddingBottom: insets.bottom + 28 }]}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <TouchableOpacity
          style={[styles.shutter, (!ready || capturing) && styles.disabled]}
          onPress={snap}
          disabled={!ready || capturing}
          accessibilityRole="button"
          accessibilityLabel="Take selfie"
        >
          {capturing ? <Spinner size={22} color="#3b6fe0" /> : <View style={styles.shutterInner} />}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  black: { flex: 1, backgroundColor: "#000" },
  white: { flex: 1, backgroundColor: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28 },
  overBar: { position: "absolute", left: 0, right: 0, top: 0 },
  title: { fontSize: 20, fontWeight: "700", color: "#111", marginBottom: 8 },
  body: { fontSize: 15, color: "#374151", textAlign: "center", marginBottom: 20, lineHeight: 21 },
  button: { backgroundColor: "#3b6fe0", borderRadius: 999, paddingVertical: 14, paddingHorizontal: 40 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  top: { position: "absolute", left: 24, right: 24, alignItems: "center" },
  hint: { color: "#fff", fontSize: 15, fontWeight: "600", textAlign: "center", textShadowColor: "rgba(0,0,0,0.6)", textShadowRadius: 4 },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center" },
  error: { color: "#fecaca", fontSize: 14, marginBottom: 14, textAlign: "center", paddingHorizontal: 24 },
  shutter: { width: 76, height: 76, borderRadius: 38, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", marginBottom: 16 },
  shutterInner: { width: 62, height: 62, borderRadius: 31, borderWidth: 3, borderColor: "#3b6fe0" },
  disabled: { opacity: 0.5 },
});
