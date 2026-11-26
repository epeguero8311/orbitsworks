import { useRef, useState } from "react";
import { Modal, View, Text, TouchableOpacity, Image, StyleSheet, Linking } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import Spinner from "../Spinner";

// Task 5 v2 (6): the WHOLE screen becomes the camera (same feel as clock
// in/out), then Retake / Use photo. Used by Create / Edit Employee and
// kiosk Create account through PhotoButton. Front camera, never a photo
// library. A full-screen Modal, so the preview is never inside a
// ScrollView (that renders black on Android).
export default function FullScreenCamera({ visible, onUse, onCancel, hint = "Center their face in the frame" }) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [shotUri, setShotUri] = useState(null);
  const insets = useSafeAreaInsets();

  function close() {
    setShotUri(null);
    setReady(false);
    onCancel();
  }

  async function snap() {
    if (!cameraRef.current || capturing || !ready) return;
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8, exif: false });
      if (photo?.uri) setShotUri(photo.uri);
    } finally {
      setCapturing(false);
    }
  }

  function use() {
    const uri = shotUri;
    setShotUri(null);
    setReady(false);
    onUse(uri);
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={close}
      supportedOrientations={["portrait", "landscape"]}
    >
      <View style={styles.black}>
        {!permission ? null : !permission.granted ? (
          <View style={styles.center}>
            <Text style={styles.title}>Camera needed</Text>
            <Text style={styles.body}>Allow the camera to take the photo used to check who is clocking in.</Text>
            <TouchableOpacity
              style={styles.button}
              onPress={() => (permission.canAskAgain ? requestPermission() : Linking.openSettings())}
            >
              <Text style={styles.buttonText}>{permission.canAskAgain ? "Allow camera" : "Open Settings"}</Text>
            </TouchableOpacity>
          </View>
        ) : shotUri ? (
          <>
            <Image source={{ uri: shotUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            <View style={[styles.bottomRow, { paddingBottom: insets.bottom + 24 }]}>
              <TouchableOpacity style={[styles.pill, styles.pillDark]} onPress={() => setShotUri(null)}>
                <Text style={styles.pillText}>Retake</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.pill, styles.pillAccent]} onPress={use}>
                <Text style={styles.pillText}>Use photo</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="front" onCameraReady={() => setReady(true)} />
            <View pointerEvents="none" style={styles.faceGuide} />
            <Text style={[styles.hint, { top: insets.top + 64 }]}>{hint}</Text>
            <View style={[styles.captureWrap, { paddingBottom: insets.bottom + 28 }]}>
              <TouchableOpacity
                style={[styles.capture, (!ready || capturing) && styles.dim]}
                onPress={snap}
                disabled={!ready || capturing}
                accessibilityLabel="Take photo"
              >
                {capturing ? <Spinner size={20} color="#fff" /> : <View style={styles.captureInner} />}
              </TouchableOpacity>
            </View>
          </>
        )}
        <TouchableOpacity style={[styles.closeBtn, { top: insets.top + 12 }]} onPress={close} accessibilityLabel="Close camera">
          <Feather name="x" size={26} color="#fff" />
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  black: { flex: 1, backgroundColor: "#000" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 32, gap: 14 },
  title: { color: "#fff", fontSize: 20, fontWeight: "700" },
  body: { color: "#ddd", fontSize: 15, textAlign: "center" },
  button: { backgroundColor: "#3b6fe0", borderRadius: 12, paddingHorizontal: 22, paddingVertical: 12 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  closeBtn: {
    position: "absolute", left: 16, width: 44, height: 44, borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", alignItems: "center",
  },
  faceGuide: {
    position: "absolute", top: "18%", alignSelf: "center", width: "62%", aspectRatio: 0.78, maxWidth: 420,
    borderRadius: 999, borderWidth: 3, borderColor: "rgba(255,255,255,0.85)", borderStyle: "dashed",
  },
  hint: { position: "absolute", alignSelf: "center", color: "#fff", fontSize: 15, fontWeight: "600" },
  captureWrap: { position: "absolute", bottom: 0, left: 0, right: 0, alignItems: "center" },
  capture: {
    width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: "#fff",
    justifyContent: "center", alignItems: "center",
  },
  dim: { opacity: 0.5 },
  captureInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: "#fff" },
  bottomRow: { position: "absolute", bottom: 0, left: 0, right: 0, flexDirection: "row", justifyContent: "center", gap: 16 },
  pill: { paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14 },
  pillDark: { backgroundColor: "rgba(0,0,0,0.6)" },
  pillAccent: { backgroundColor: "#3b6fe0" },
  pillText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
