import { useState, useRef } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useAuth } from "../lib/AuthContext";
import { submitClockEvent } from "../lib/clockLogic";

export default function ClockCameraScreen({ route, navigation }) {
  const { employee } = route.params;
  const { userData, currentUser } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [submitting, setSubmitting] = useState(false);
  const cameraRef = useRef(null);

  if (!permission) {
    return <View style={styles.center}><ActivityIndicator color="#3b6fe0" /></View>;
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.permText}>Camera access is needed to clock in.</Text>
        <TouchableOpacity style={styles.permButton} onPress={requestPermission}>
          <Text style={styles.permButtonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleCapture = async () => {
    if (!cameraRef.current || submitting) return;
    setSubmitting(true);

    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.5 });

      const resultType = await submitClockEvent({
        companyId: userData.companyId,
        employee,
        photoUri: photo.uri,
        source: "pin",
        createdByUid: currentUser.uid,
      });

      navigation.replace("ClockConfirm", {
        employeeName: employee.name,
        resultType,
      });
    } catch (error) {
      console.log("Clock event failed:", error);
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={styles.camera} facing="front" />

      <View style={styles.overlay}>
        <Text style={styles.name}>{employee.name}</Text>
        <TouchableOpacity
          style={styles.captureButton}
          onPress={handleCapture}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <View style={styles.captureInner} />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  camera: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  permText: { textAlign: "center", marginBottom: 16, color: "#333" },
  permButton: { backgroundColor: "#3b6fe0", padding: 14, borderRadius: 8 },
  permButtonText: { color: "#fff", fontWeight: "600" },
  overlay: {
    position: "absolute",
    bottom: 40,
    width: "100%",
    alignItems: "center",
  },
  name: { color: "#fff", fontSize: 18, fontWeight: "600", marginBottom: 16 },
  captureButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
  },
  captureInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#fff",
  },
});
