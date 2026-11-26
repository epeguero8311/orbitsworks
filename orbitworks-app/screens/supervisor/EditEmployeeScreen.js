import { useState } from "react";
import { Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { useAuth } from "../../lib/AuthContext";
import { useTheme } from "../../lib/ThemeContext";
import { validateEmployeeName, EMPLOYEE_NAME_MAX_LENGTH } from "../../lib/validators/createEmployee";
import { queueUpdateEmployee } from "../../lib/employeeUpdateQueue";
import { syncEmployeeUpdateQueueItemNow } from "../../lib/employeeUpdateQueueSync";
import { getOrCreateDeviceId } from "../../lib/deviceId";
import ScreenHeader from "../../components/ScreenHeader";
import Spinner from "../../components/Spinner";
import BirthdayBoxes from "../../components/join/BirthdayBoxes";
import PhotoButton from "../../components/camera/PhotoButton";
import { birthdayBoxes, birthdayIso } from "../../lib/employeeCreateFlow";

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
// current name/photo. Supervisors can only change name and photo here;
// admins/owners can also set a new PIN (same permission as the web's
// setEmployeePin). Nothing else (rate, sites, active status) is editable
// from this screen, per spec.
export default function EditEmployeeScreen({ navigation, route }) {
  const { employee } = route.params;
  const { userData, currentUser } = useAuth();
  const { colors } = useTheme();
  const [name, setName] = useState(employee.name || "");
  const [nameError, setNameError] = useState(null);
  const canEditPin = userData?.role === "admin" || userData?.role === "owner";
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState(null);
  // Task 5 v2 (5): birthday (name + birthday + photo). Blank on an older
  // record = leave it unset.
  const [birthday, setBirthday] = useState(birthdayBoxes(employee.dob));
  const [birthdayError, setBirthdayError] = useState(null);
  // Task 5 v2 (6): the photo button turns the whole screen into the camera.
  const [newPhotoUri, setNewPhotoUri] = useState(null);
  const [photoNoticeShownAt, setPhotoNoticeShownAt] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const trimmedName = validateEmployeeName(name).trimmed;
  const nameChanged = !!validateEmployeeName(name).valid && trimmedName !== employee.name;
  // Blank = keep the current PIN.
  const pinEntered = canEditPin && pin.length > 0;
  const pinValid = !pinEntered || /^\d{4}$/.test(pin);
  const birthdayTyped = !!(birthday.mm || birthday.dd || birthday.yyyy);
  const bday = birthdayTyped ? birthdayIso(birthday) : null;
  const dobChanged = !!bday?.ok && bday.iso !== employee.dob;
  const canSubmit =
    !!validateEmployeeName(name).valid && pinValid && (nameChanged || !!newPhotoUri || pinEntered || dobChanged) && !submitting;
  async function handleSave() {
    const validated = validateEmployeeName(name);
    if (!validated.valid) {
      setNameError(validated.error);
      return;
    }
    if (bday && !bday.ok) {
      setBirthdayError(bday.error);
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
        employeeName: employee.name,
        name: nameChanged ? validated.trimmed : null,
        pin: pinEntered ? pin : null,
        dob: dobChanged ? bday.iso : null,
        photoUri: newPhotoUri,
        photoNoticeShownAt: newPhotoUri ? photoNoticeShownAt : null,
        deviceId,
        updatedByName,
        companyId: userData.companyId,
      });

      const net = await NetInfo.fetch();
      if (net.isConnected) {
        const outcome = await withTimeout(syncEmployeeUpdateQueueItemNow(localId, userData.companyId), ONLINE_ATTEMPT_TIMEOUT_MS);
        // Task 5 v2 (F): e.g. the same name + birthday as someone else.
        if (outcome?.terminal) {
          setSubmitError("Couldn't save this change - see Employee Alerts for why.");
          return;
        }
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
      if (err?.code === "pinTaken") {
        setPinError(err.message);
        return;
      }
      console.log("Update employee failed:", err.message);
      setSubmitError("Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
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
          style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.card }]}
        />
        {nameError && <Text style={[styles.error, { color: colors.red }]}>{nameError}</Text>}

        <Text style={[styles.label, { color: colors.subtext, marginTop: 20 }]}>Birthday</Text>
        <BirthdayBoxes
          value={birthday}
          onChange={(b) => {
            setBirthday(b);
            setBirthdayError(null);
          }}
          editable={!submitting}
          colors={colors}
        />
        {birthdayError && <Text style={[styles.error, { color: colors.red }]}>{birthdayError}</Text>}

        {canEditPin && (
          <>
            <Text style={[styles.label, { color: colors.subtext, marginTop: 20 }]}>New PIN</Text>
            <TextInput
              value={pin}
              onChangeText={(text) => {
                setPin(text.replace(/\D/g, "").slice(0, 4));
                setPinError(null);
              }}
              placeholder="Leave blank to keep the current PIN"
              placeholderTextColor={colors.subtext}
              keyboardType="number-pad"
              maxLength={4}
              secureTextEntry
              style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.card }]}
            />
            {pinError ? (
              <Text style={[styles.error, { color: colors.red }]}>{pinError}</Text>
            ) : pinEntered && !pinValid ? (
              <Text style={[styles.error, { color: colors.red }]}>PIN must be 4 digits</Text>
            ) : null}
          </>
        )}

        <Text style={[styles.label, { color: colors.subtext, marginTop: 20 }]}>Photo</Text>
        <PhotoButton
          photoUri={newPhotoUri}
          currentPhotoUrl={employee.photoUrl}
          name={employee.name}
          onPhoto={(uri, noticeAt) => {
            setNewPhotoUri(uri);
            setPhotoNoticeShownAt(noticeAt);
          }}
          disabled={submitting}
        />

        {submitError && <Text style={[styles.error, { color: colors.red, marginTop: 16 }]}>{submitError}</Text>}

        <TouchableOpacity
          style={[styles.submitButton, { backgroundColor: colors.accent }, !canSubmit && styles.dim]}
          onPress={handleSave}
          disabled={!canSubmit}
        >
          {submitting ? <Spinner size={20} color="#fff" /> : <Text style={styles.submitButtonText}>Save Changes</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40, width: "100%", maxWidth: 640, alignSelf: "center" },
  label: { fontSize: 13, fontWeight: "600", marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  error: { fontSize: 12, marginTop: 6 },
  submitButton: { marginTop: 28, borderRadius: 14, paddingVertical: 16, alignItems: "center" },
  submitButtonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  dim: { opacity: 0.4 },
});
