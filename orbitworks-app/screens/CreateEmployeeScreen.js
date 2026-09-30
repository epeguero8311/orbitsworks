import { useRef, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, Image, StyleSheet,
  ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import NetInfo from "@react-native-community/netinfo";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "../lib/AuthContext";
import { useTheme } from "../lib/ThemeContext";
import { validateEmployeeName, EMPLOYEE_NAME_MAX_LENGTH } from "../lib/validators/createEmployee";
import { queueCreateEmployee } from "../lib/employeeQueue";
import { syncEmployeeQueueItemNow } from "../lib/employeeQueueSync";
import ScreenHeader from "../components/ScreenHeader";
import CreateEmployeeSuccessModal from "../components/CreateEmployeeSuccessModal";

// How long the online attempt gets to finish before this just falls back to
// the offline messaging - the queued item keeps retrying in the background
// either way (see employeeQueueSync.js), so a slow/lying "connected" network
// never leaves the person stuck watching a spinner.
const ONLINE_ATTEMPT_TIMEOUT_MS = 10000;

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

export default function CreateEmployeeScreen({ navigation }) {
  const { userData, currentUser } = useAuth();
  const { colors } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);

  const [name, setName] = useState("");
  const [nameError, setNameError] = useState(null);
  const [rawPhotoUri, setRawPhotoUri] = useState(null); // just snapped, awaiting retake/use
  const [confirmedPhotoUri, setConfirmedPhotoUri] = useState(null); // set
  const [capturing, setCapturing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [result, setResult] = useState(null); // { name, pin, photoUri, offline }

  const canSubmit = !!validateEmployeeName(name).valid && !!confirmedPhotoUri && !submitting;

  async function handleCapture() {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      setRawPhotoUri(photo.uri);
    } finally {
      setCapturing(false);
    }
  }

  function handleRetake() {
    setRawPhotoUri(null);
  }

  function handleUsePhoto() {
    setConfirmedPhotoUri(rawPhotoUri);
    setRawPhotoUri(null);
  }

  function handleRetakeConfirmed() {
    setConfirmedPhotoUri(null);
  }

  async function handleCreate() {
    const validated = validateEmployeeName(name);
    if (!validated.valid) {
      setNameError(validated.error);
      return;
    }
    if (!confirmedPhotoUri || submitting) return;

    setSubmitError(null);
    setSubmitting(true);
    try {
      const { localId, pin: localPin } = await queueCreateEmployee({
        name: validated.trimmed,
        photoUri: confirmedPhotoUri,
        createdByUid: currentUser.uid,
        companyId: userData.companyId,
      });

      const net = await NetInfo.fetch();
      let outcome = null;
      if (net.isConnected) {
        outcome = await withTimeout(
          syncEmployeeQueueItemNow(localId, userData.companyId),
          ONLINE_ATTEMPT_TIMEOUT_MS
        );
      }

      if (outcome?.success) {
        setResult({ name: validated.trimmed, pin: outcome.pin, photoUri: confirmedPhotoUri, offline: false });
      } else if (outcome?.terminal) {
        setSubmitError(
          "Couldn't create this employee - see the alert for details, or try again from Employee Alerts."
        );
        return;
      } else {
        // Offline, or the attempt timed out / hit a transient error - the
        // queue keeps retrying in the background (see useEmployeeQueueSync.js).
        setResult({ name: validated.trimmed, pin: localPin, photoUri: confirmedPhotoUri, offline: true });
      }
    } catch (err) {
      console.log("Create employee failed:", err.message);
      setSubmitError("Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleModalClose() {
    setResult(null);
    navigation.navigate("Dashboard");
  }

  if (!permission) {
    return <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>;
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScreenHeader title="Create Employee" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.label, { color: colors.subtext }]}>Full name</Text>
        <TextInput
          value={name}
          onChangeText={(text) => {
            setName(text);
            setNameError(null);
          }}
          placeholder="e.g. Jordan Lee"
          placeholderTextColor={colors.subtext}
          maxLength={EMPLOYEE_NAME_MAX_LENGTH}
          style={[
            styles.input,
            { borderColor: colors.border, color: colors.text, backgroundColor: colors.card },
          ]}
        />
        {nameError && <Text style={[styles.error, { color: colors.red }]}>{nameError}</Text>}

        <Text style={[styles.label, { color: colors.subtext, marginTop: 20 }]}>Reference photo</Text>

        {confirmedPhotoUri ? (
          <View style={styles.confirmedRow}>
            <Image source={{ uri: confirmedPhotoUri }} style={styles.confirmedPhoto} />
            <TouchableOpacity
              style={[styles.retakeChip, { borderColor: colors.border }]}
              onPress={handleRetakeConfirmed}
            >
              <Feather name="camera" size={14} color={colors.accent} />
              <Text style={[styles.retakeChipText, { color: colors.accent }]}>Retake</Text>
            </TouchableOpacity>
          </View>
        ) : rawPhotoUri ? (
          <View style={styles.photoBox}>
            <Image source={{ uri: rawPhotoUri }} style={styles.cameraFill} />
            <View style={styles.previewActions}>
              <TouchableOpacity style={[styles.previewButton, { backgroundColor: "rgba(0,0,0,0.55)" }]} onPress={handleRetake}>
                <Text style={styles.previewButtonText}>Retake</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.previewButton, { backgroundColor: colors.accent }]} onPress={handleUsePhoto}>
                <Text style={styles.previewButtonText}>Use photo</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : !permission.granted ? (
          <View style={[styles.photoBox, styles.permBox, { borderColor: colors.border }]}>
            <Text style={[styles.permText, { color: colors.text }]}>
              Camera access is needed to take a reference photo.
            </Text>
            <TouchableOpacity style={[styles.previewButton, { backgroundColor: colors.accent }]} onPress={requestPermission}>
              <Text style={styles.previewButtonText}>Grant Permission</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.photoBox}>
            <CameraView ref={cameraRef} style={styles.cameraFill} facing="front" />
            <View pointerEvents="none" style={styles.faceGuide} />
            <Text style={styles.guideHint}>Center their face in the frame</Text>
            <TouchableOpacity
              style={[styles.captureButton, capturing && styles.captureButtonDisabled]}
              onPress={handleCapture}
              disabled={capturing}
            >
              {capturing ? <ActivityIndicator color="#fff" /> : <View style={styles.captureInner} />}
            </TouchableOpacity>
          </View>
        )}

        {submitError && <Text style={[styles.error, { color: colors.red, marginTop: 16 }]}>{submitError}</Text>}

        <TouchableOpacity
          style={[styles.submitButton, { backgroundColor: colors.accent }, !canSubmit && { opacity: 0.4 }]}
          onPress={handleCreate}
          disabled={!canSubmit}
        >
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitButtonText}>Create Employee</Text>}
        </TouchableOpacity>
      </ScrollView>

      <CreateEmployeeSuccessModal
        visible={!!result}
        name={result?.name}
        pin={result?.pin}
        photoUri={result?.photoUri}
        offline={result?.offline}
        onClose={handleModalClose}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 },
  label: { fontSize: 13, fontWeight: "600", marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  error: { fontSize: 12, marginTop: 6 },
  photoBox: {
    width: "100%", aspectRatio: 1, borderRadius: 16, overflow: "hidden",
    backgroundColor: "#000", justifyContent: "flex-end", alignItems: "center",
  },
  permBox: { backgroundColor: "transparent", borderWidth: 1, justifyContent: "center", gap: 16, padding: 20 },
  permText: { textAlign: "center", fontSize: 14 },
  cameraFill: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  faceGuide: {
    position: "absolute", top: "16%", alignSelf: "center",
    width: "56%", height: "62%", borderRadius: 999,
    borderWidth: 3, borderColor: "rgba(255,255,255,0.85)", borderStyle: "dashed",
  },
  guideHint: {
    position: "absolute", top: "10%", alignSelf: "center",
    color: "#fff", fontSize: 12, fontWeight: "600",
  },
  captureButton: {
    marginBottom: 20, width: 64, height: 64, borderRadius: 32, borderWidth: 4,
    borderColor: "#fff", justifyContent: "center", alignItems: "center",
  },
  captureButtonDisabled: { opacity: 0.5 },
  captureInner: { width: 48, height: 48, borderRadius: 24, backgroundColor: "#fff" },
  previewActions: {
    position: "absolute", bottom: 16, flexDirection: "row", gap: 12,
  },
  previewButton: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12 },
  previewButtonText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  confirmedRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  confirmedPhoto: { width: 88, height: 88, borderRadius: 44 },
  retakeChip: {
    flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1,
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
  },
  retakeChipText: { fontSize: 13, fontWeight: "600" },
  submitButton: { marginTop: 28, borderRadius: 14, paddingVertical: 16, alignItems: "center" },
  submitButtonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
