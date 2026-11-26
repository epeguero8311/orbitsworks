import { useState } from "react";
import { Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Alert } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { useAuth } from "../../lib/AuthContext";
import { useTheme } from "../../lib/ThemeContext";
import { validateEmployeeName, EMPLOYEE_NAME_MAX_LENGTH } from "../../lib/validators/createEmployee";
import { queueCreateEmployee } from "../../lib/employeeQueue";
import { syncEmployeeQueueItemNow } from "../../lib/employeeQueueSync";
import { birthdayIso, pinForNewEmployee } from "../../lib/employeeCreateFlow";
import { syncKioskTable } from "../../lib/kioskPinStore";
import ScreenHeader from "../../components/ScreenHeader";
import BirthdayBoxes from "../../components/join/BirthdayBoxes";
import PhotoButton from "../../components/camera/PhotoButton";
import NewPinModal from "../../components/supervisor/NewPinModal";
import Spinner from "../../components/Spinner";
import { useKioskIdle } from "../../lib/hooks/useKioskIdle";
import { KIOSK_IDLE_ACTION_MS } from "../../lib/kioskLayout";

// Create Employee (supervisor app) and Create account (Kiosk, Task 5 v2):
//   Name, Birthday (MM/DD/YYYY), Photo (full-screen camera, retake / use)
//   -> "Your PIN: 4821 ..." [OK] -> only then is the account created.
// The PIN is held for this login on the server first (reserveEmployeePin,
// which also blocks a same name + birthday duplicate); offline it is a
// local guess and the create waits in the queue like before.
// route.params: { mode: "kiosk", adminProof } for the kiosk.
// Kiosk only (cleanup 2026-11-26): back to Home after 8 s with no tap or
// keystroke, paused while the photo notice / camera or the PIN modal is up
// (they must press OK) and while the account is being created.

const ONLINE_ATTEMPT_TIMEOUT_MS = 10000;

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(null), ms))]);
}

const STOP_TEXT = {
  duplicate: null, // the server's own message
  adminPin: "That admin PIN can't approve this. Go back and try again.",
  createOff: "Creating accounts on this kiosk is turned off.",
  notPro: "Kiosk needs Pro - ask your admin",
};

export default function CreateEmployeeScreen({ navigation, route }) {
  const mode = route?.params?.mode === "kiosk" ? "kiosk" : "supervisor";
  const adminProof = route?.params?.adminProof ?? null;
  const isKiosk = mode === "kiosk";
  const { userData, currentUser } = useAuth();
  const { colors } = useTheme();

  const [name, setName] = useState("");
  const [nameError, setNameError] = useState(null);
  const [birthday, setBirthday] = useState({ mm: "", dd: "", yyyy: "" });
  const [birthdayError, setBirthdayError] = useState(null);
  const [photoUri, setPhotoUri] = useState(null);
  const [photoNoticeShownAt, setPhotoNoticeShownAt] = useState(null);
  const [preparing, setPreparing] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [pending, setPending] = useState(null); // { name, dob, pin } waiting for OK
  const [creating, setCreating] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const touch = useKioskIdle(navigation, isKiosk ? KIOSK_IDLE_ACTION_MS : null, photoOpen || !!pending || creating || preparing);

  const canContinue = !!validateEmployeeName(name).valid && !!photoUri && !preparing;

  function goHome() {
    if (isKiosk) navigation.popToTop();
    else navigation.navigate("MainTabs");
  }

  async function handleContinue() {
    const validated = validateEmployeeName(name);
    const bday = birthdayIso(birthday);
    setNameError(validated.valid ? null : validated.error);
    setBirthdayError(bday.ok ? null : bday.error);
    if (!validated.valid || !bday.ok || !photoUri || preparing) return;

    setSubmitError(null);
    setPreparing(true);
    try {
      const { pin } = await pinForNewEmployee({ name: validated.trimmed, dob: bday.iso, adminProof, mode });
      setPending({ name: validated.trimmed, dob: bday.iso, pin });
    } catch (err) {
      setSubmitError(STOP_TEXT[err.code] || err.message || "Something went wrong. Try again.");
    } finally {
      setPreparing(false);
    }
  }

  // OK in the PIN modal: NOW the account is created (queued, then sent).
  async function handleOk() {
    if (!pending || creating) return;
    setCreating(true);
    try {
      const { localId } = await queueCreateEmployee({
        name: pending.name,
        photoUri,
        createdByUid: currentUser.uid,
        companyId: userData.companyId,
        photoNoticeShownAt,
        pin: pending.pin,
        dob: pending.dob,
        mode,
        adminProof: isKiosk ? adminProof : null,
      });

      const net = await NetInfo.fetch();
      const outcome = net.isConnected
        ? await withTimeout(syncEmployeeQueueItemNow(localId, userData.companyId), ONLINE_ATTEMPT_TIMEOUT_MS)
        : null;

      if (outcome?.success && outcome.pin && outcome.pin !== pending.pin) {
        // Rare: the hold ran out and the PIN was taken meanwhile.
        Alert.alert("PIN changed", `${pending.name}'s PIN is ${outcome.pin}. Write it down - it can't be shown again.`);
      } else if (outcome?.terminal) {
        Alert.alert("Not created", isKiosk ? "This account couldn't be created. Ask your admin." : "Couldn't create this employee - see Employee Alerts for details.");
      }
      if (isKiosk && currentUser?.uid) syncKioskTable(currentUser.uid).catch(() => {});
      setPending(null);
      goHome();
    } catch (err) {
      console.log("Create employee failed:", err.message);
      setPending(null);
      setSubmitError("Something went wrong. Try again.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      onTouchStart={touch}
    >
      <ScreenHeader title={isKiosk ? "Create account" : "Create Employee"} onBack={() => (isKiosk ? navigation.popToTop() : navigation.goBack())} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.label, { color: colors.subtext }]}>Name</Text>
        <TextInput
          value={name}
          onChangeText={(text) => {
            touch();
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
            touch();
            setBirthday(b);
            setBirthdayError(null);
          }}
          editable={!preparing}
          colors={colors}
        />
        {birthdayError && <Text style={[styles.error, { color: colors.red }]}>{birthdayError}</Text>}

        <Text style={[styles.label, { color: colors.subtext, marginTop: 20 }]}>Photo</Text>
        <PhotoButton
          photoUri={photoUri}
          name={name}
          onOpenChange={setPhotoOpen}
          onPhoto={(uri, noticeAt) => {
            setPhotoUri(uri);
            setPhotoNoticeShownAt(noticeAt);
          }}
          disabled={preparing}
        />

        {submitError && <Text style={[styles.error, { color: colors.red, marginTop: 16 }]}>{submitError}</Text>}

        <TouchableOpacity
          style={[styles.submitButton, { backgroundColor: colors.accent }, !canContinue && styles.dim]}
          onPress={handleContinue}
          disabled={!canContinue}
        >
          {preparing ? <Spinner size={20} color="#fff" /> : <Text style={styles.submitButtonText}>{isKiosk ? "Create account" : "Create Employee"}</Text>}
        </TouchableOpacity>
      </ScrollView>

      <NewPinModal visible={!!pending} pin={pending?.pin} busy={creating} onOk={handleOk} />
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
