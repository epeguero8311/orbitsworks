import { useRef, useState } from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet, Linking } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Spinner from "../Spinner";

// Phase 4: a smaller photo so a punch uploads faster on weak signal (and
// takes less room while saved offline). Used only when the phone offers
// this size; otherwise the camera's default. Checked on dev: no change in
// the face check. Employee App only - the supervisor camera is unchanged.
const PICTURE_SIZE = "1280x720";

// Live clock photo for the Employee App: front camera only, no photo
// library. After taking it the employee sees it and picks Retake or Use
// photo. quality 0.5, same as the supervisor ClockCameraScreen (these go
// through the same face check), at 1280x720 (see PICTURE_SIZE). onUse(uri)
// - the photo is never logged.
export default function PunchCamera({ onUse, onCancel }) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [pictureSize, setPictureSize] = useState(undefined);
  const [capturing, setCapturing] = useState(false);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const insets = useSafeAreaInsets();

  if (!permission) return <View style={styles.black} />;

  async function onCameraReady() {
    setReady(true);
    try {
      const sizes = await cameraRef.current?.getAvailablePictureSizesAsync();
      if (Array.isArray(sizes) && sizes.includes(PICTURE_SIZE)) setPictureSize(PICTURE_SIZE);
    } catch {
      // Keep the default size.
    }
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Camera needed</Text>
        <Text style={styles.body}>{"Allow the camera to take your clock photo. It's how your company checks it's you."}</Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() => (permission.canAskAgain ? requestPermission() : Linking.openSettings())}
        >
          <Text style={styles.buttonText}>{permission.canAskAgain ? "Allow camera" : "Open Settings"}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onCancel}>
          <Text style={styles.link}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  async function snap() {
    if (!cameraRef.current || capturing || !ready) return;
    setCapturing(true);
    setError(null);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.5, exif: false });
      if (photo && photo.uri) setPreview(photo.uri);
      else setError("That photo didn't work. Try again.");
    } catch {
      setError("That photo didn't work. Try again.");
    } finally {
      setCapturing(false);
    }
  }

  if (preview) {
    return (
      <View style={styles.black}>
        <Image source={{ uri: preview }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        <View style={[styles.bottom, styles.previewRow, { paddingBottom: insets.bottom + 28 }]}>
          <TouchableOpacity style={[styles.choice, styles.retake]} onPress={() => setPreview(null)}>
            <Text style={styles.choiceText}>Retake</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.choice, styles.use]} onPress={() => onUse(preview)}>
            <Text style={styles.choiceText}>Use photo</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.black}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="front"
        pictureSize={pictureSize}
        onCameraReady={onCameraReady}
      />
      <View style={[styles.top, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.hint}>Face the camera, in good light.</Text>
      </View>
      <View style={[styles.bottom, { paddingBottom: insets.bottom + 28 }]}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <TouchableOpacity
          style={[styles.shutter, (!ready || capturing) && styles.disabled]}
          onPress={snap}
          disabled={!ready || capturing}
          accessibilityRole="button"
          accessibilityLabel="Take photo"
        >
          {capturing ? <Spinner size={22} color="#3b6fe0" /> : <View style={styles.shutterInner} />}
        </TouchableOpacity>
        <TouchableOpacity onPress={onCancel} disabled={capturing}>
          <Text style={styles.cancel}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  black: { flex: 1, backgroundColor: "#000" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28, backgroundColor: "#fff" },
  title: { fontSize: 20, fontWeight: "700", color: "#111", marginBottom: 8 },
  body: { fontSize: 15, color: "#374151", textAlign: "center", marginBottom: 20, lineHeight: 21 },
  button: { backgroundColor: "#3b6fe0", borderRadius: 999, paddingVertical: 14, paddingHorizontal: 40 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  link: { color: "#3b6fe0", fontSize: 15, fontWeight: "500", marginTop: 18 },
  top: { position: "absolute", left: 24, right: 24, top: 0, alignItems: "center" },
  hint: { color: "#fff", fontSize: 15, fontWeight: "600", textAlign: "center", textShadowColor: "rgba(0,0,0,0.6)", textShadowRadius: 4 },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center" },
  previewRow: { flexDirection: "row", justifyContent: "center", gap: 16 },
  error: { color: "#fecaca", fontSize: 14, marginBottom: 14, textAlign: "center", paddingHorizontal: 24 },
  shutter: { width: 76, height: 76, borderRadius: 38, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", marginBottom: 16 },
  shutterInner: { width: 62, height: 62, borderRadius: 31, borderWidth: 3, borderColor: "#3b6fe0" },
  disabled: { opacity: 0.5 },
  cancel: { color: "#fff", fontSize: 16, fontWeight: "600" },
  choice: { borderRadius: 999, paddingVertical: 14, paddingHorizontal: 28 },
  retake: { backgroundColor: "rgba(0,0,0,0.6)", borderWidth: 1, borderColor: "#fff" },
  use: { backgroundColor: "#22c55e" },
  choiceText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
