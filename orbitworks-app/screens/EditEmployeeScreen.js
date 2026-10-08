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
import { queueUpdateEmployee } from "../lib/employeeUpdateQueue";
import { syncEmployeeUpdateQueueItemNow } from "../lib/employeeUpdateQueueSync";
import { getOrCreateDeviceId } from "../lib/deviceId";
import ScreenHeader from "../components/ScreenHeader";
import Avatar from "../components/Avatar";

// How long the online attempt gets to finish before this just falls back
// to the offline messaging - same tradeoff as CreateEmployeeScreen.js's
// ONLINE_ATTEMPT_TIMEOUT_MS (the queued item keeps retrying in the
// background either way).
const ONLINE_ATTEMPT_TIMEOUT_MS = 10000;

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

// Update Employee (mobile) - same camera/retake/name-input shape as
// CreateEmployeeScreen.js (copied, not shared - that screen has no
// extractable component to import), pre-filled with the employee's
// current name/photo. Supervisors can only change name and photo here -
// nothing else (rate, PIN, sites, active status) is editable from this
// screen, per spec.
export default function EditEmployeeScreen({ navigation, route }) {
  const { employee } = route.params;
  const { userData, currentUser } = useAuth();
  const { colors } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);

  const [name, setName] = useState(employee.name || "");
  const [nameError, setNameError] = useState(null);
  // Unlike CreateEmployeeScreen.js (which always opens straight to the
  // camera, since there's no existing photo yet), this screen defaults to
  // showing the employee's current photo - the camera only opens once the
  // person explicitly asks to change it.
  const [cameraOpen, setCameraOpen] = useState(false);
  const [rawPhotoUri, setRawPhotoUri] = useState(null); // just snapped, awaiting retake/use
  const [newPhotoUri, setNewPhotoUri] = useState(null); // confirmed retake, replaces employee.photoUrl
  const [capturing, setCapturing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const trimmedName = validateEmployeeName(name).trimmed;
  const nameChanged = !!validateEmployeeName(name).valid && trimmedName !== employee.name;
  const canSubmit = !!validateEmployeeName(name).valid && (nameChanged || !!newPhotoUri) && !submitting;

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
    setNewPhotoUri(rawPhotoUri);
    setRawPhotoUri(null);
    setCameraOpen(false);
  }

  // Discards the just-confirmed retake and reopens the camera right away
  // (same single-step "Retake" behavior as CreateEmployeeScreen.js) -
  // unlike dismissing the camera entirely, which goes back to showing the
  // employee's original photo instead (see handleChangePhoto/below).
  function handleRetakeConfirmed() {
    setNewPhotoUri(null);
    setCameraOpen(true);
  }

  async function handleChangePhoto() {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) return;
    }
    setCameraOpen(true);
  }

  async function handleSave() {
    const validated = validateEmployeeName(name);
    if (!validated.valid) {
      setNameError(validated.error);
      return;
    }
    if (!canSubmit) return;

    setSubmitError(null);
    setSubmitting(true);
    try {
      const deviceId = await getOrCreateDeviceId();
      const updatedByName = currentUser.displayName || currentUser.email || "A supervisor";

      const { localId } = await queueUpdateEmployee({
        employeeId: employee.id,
        name: nameChanged ? validated.trimmed : null,
        photoUri: newPhotoUri,
        deviceId,
        updatedByName,
        companyId: userData.companyId,
      });

      const net = await NetInfo.fetch();
      if (net.isConnected) {
        await withTimeout(syncEmployeeUpdateQueueItemNow(localId, userData.companyId), ONLINE_ATTEMPT_TIMEOUT_MS);
      }
      // Whether the online attempt succeeded, timed out, or this is
      // offline, the queued item keeps retrying in the background (see
      // useEmployeeUpdateQueueSync.js) - same "always show success" shape
      // as CreateEmployeeScreen.js's offline branch. Navigating here,
      // inside the handler, rather than from a `saved` state branch in
      // the render body - calling navigation.goBack() during render
      // triggers React's "Cannot update a component while rendering a
      // different component" warning, since it synchronously updates the
      // navigator's own state mid-render.
      navigation.goBack();
    } catch (err) {
      console.log("Update employee failed:", err.message);
      setSubmitError("Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!permission) {
    return <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>;
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScreenHeader title="Edit Employee" onBack={() => navigation.goBack()} />
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

        {newPhotoUri ? (
          <View style={styles.confirmedRow}>
            <Image source={{ uri: newPhotoUri }} style={styles.confirmedPhoto} />
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
        ) : !cameraOpen ? (
          <View style={styles.confirmedRow}>
            <Avatar name={employee.name} photoUrl={employee.photoUrl} size={88} />
            <TouchableOpacity
              style={[styles.retakeChip, { borderColor: colors.border }]}
              onPress={handleChangePhoto}
            >
              <Feather name="camera" size={14} color={colors.accent} />
              <Text style={[styles.retakeChipText, { color: colors.accent }]}>Change photo</Text>
            </TouchableOpacity>
          </View>
        ) : !permission.granted ? (
          <View style={[styles.photoBox, styles.permBox, { borderColor: colors.border }]}>
            <Text style={[styles.permText, { color: colors.text }]}>
              Camera access is needed to take a new reference photo.
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
          onPress={handleSave}
          disabled={!canSubmit}
        >
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitButtonText}>Save Changes</Text>}
        </TouchableOpacity>
      </ScrollView>
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
