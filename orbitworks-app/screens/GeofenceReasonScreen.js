import { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform,
} from "react-native";
import * as Haptics from "expo-haptics";
import { useAuth } from "../lib/AuthContext";
import { useTheme } from "../lib/ThemeContext";
import { queueClockEvent } from "../lib/clockQueue";
import { drainQueue } from "../lib/queueSync";
import ScreenHeader from "../components/ScreenHeader";

// Same bounds as OverrideReasonScreen.js / the server-side check in
// functions/src/geofencing.ts (evaluateEnforcement) - kept in sync
// manually, same convention as every other cross-package duplication in
// this app (see lib/geofenceCheck.js).
const MIN_LENGTH = 10;
const MAX_LENGTH = 500;

// Geofencing (Pro) Part 3 - reached from ClockCameraScreen when the
// company's mode is "Require reason" and the worker is outside the
// site's geofence. Reuses the photo already captured there (never
// retaken) and queues the same way a normal clock-in would, just with a
// reason attached.
export default function GeofenceReasonScreen({ navigation, route }) {
  const { employee, photoUri, siteId, siteName, location, message } = route.params;
  const { userData, currentUser } = useAuth();
  const { colors } = useTheme();
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const trimmed = reason.trim();
  const isValid = trimmed.length >= MIN_LENGTH && trimmed.length <= MAX_LENGTH;

  async function handleSubmit() {
    if (!isValid || submitting) return;
    setSubmitting(true);
    try {
      const resultType = await queueClockEvent({
        employee,
        photoUri,
        source: "pin",
        createdByUid: currentUser.uid,
        siteId,
        siteName,
        location,
        reason: trimmed,
      });
      drainQueue(userData.companyId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.replace("ClockConfirm", { employeeName: employee.name, resultType });
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      console.log("[GeofenceReason] clock-in failed:", err.message);
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScreenHeader title="Reason Needed" onBack={() => navigation.popToTop()} />

      <View style={styles.content}>
        <Text style={[styles.label, { color: colors.subtext }]}>
          {message || `You're outside ${siteName}'s geofence.`} Enter a reason to clock in anyway.
        </Text>
        <TextInput
          style={[
            styles.input,
            { borderColor: colors.border, color: colors.text, backgroundColor: colors.card },
          ]}
          placeholder="e.g. Parked across the street, working the back lot..."
          placeholderTextColor={colors.subtext}
          value={reason}
          onChangeText={setReason}
          multiline
          textAlignVertical="top"
          maxLength={MAX_LENGTH}
        />
        <Text style={[styles.counter, { color: colors.subtext }]}>
          {trimmed.length}/{MAX_LENGTH} (minimum {MIN_LENGTH})
        </Text>

        <TouchableOpacity
          style={[
            styles.submitButton,
            { backgroundColor: colors.accent },
            (!isValid || submitting) && { opacity: 0.4 },
          ]}
          onPress={handleSubmit}
          disabled={!isValid || submitting}
        >
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitButtonText}>Clock In</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 20 },
  label: { fontSize: 14, marginBottom: 10 },
  input: {
    borderWidth: 1, borderRadius: 14, padding: 16, fontSize: 15, minHeight: 140,
  },
  counter: { fontSize: 11, marginTop: 6, textAlign: "right" },
  submitButton: { marginTop: 16, borderRadius: 14, paddingVertical: 16, alignItems: "center" },
  submitButtonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
