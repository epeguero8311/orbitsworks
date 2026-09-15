import { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform,
} from "react-native";
import * as Haptics from "expo-haptics";
import { useAuth } from "../lib/AuthContext";
import { useTheme } from "../lib/ThemeContext";
import { submitOverrideBatch } from "../lib/clockQueue";
import { drainQueue } from "../lib/queueSync";
import ScreenHeader from "../components/ScreenHeader";

const MIN_LENGTH = 10;
const MAX_LENGTH = 500;

// Second step of the override flow when the company requires a reason
// (Settings > Attendance Rules) - OverrideEmployeeListScreen routes here
// instead of submitting directly. Collects one reason for the whole
// batch, then does the same queue submission that screen would have.
export default function OverrideReasonScreen({ navigation, route }) {
  const { selected, direction, siteId, siteName, authorizedBy } = route.params;
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
      await submitOverrideBatch({
        employees: selected,
        direction,
        createdByUid: currentUser?.uid,
        authorizedBy,
        siteId,
        siteName,
        reason: trimmed,
      });
      drainQueue(userData.companyId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.navigate("Dashboard");
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      console.log("[OverrideReason] override action failed:", err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const who = selected.length === 1 ? selected[0].name : `${selected.length} employees`;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScreenHeader title="Reason for Override" onBack={() => navigation.goBack()} />

      <View style={styles.content}>
        <Text style={[styles.label, { color: colors.subtext }]}>
          Why are you overriding {who}&apos;s clock {direction === "in" ? "in" : "out"}?
        </Text>
        <TextInput
          style={[
            styles.input,
            { borderColor: colors.border, color: colors.text, backgroundColor: colors.card },
          ]}
          placeholder="e.g. Forgot badge, phone died, left without clocking out..."
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
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitButtonText}>
              {direction === "in" ? "Clock In" : "Clock Out"}
              {selected.length > 0 ? ` (${selected.length})` : ""}
            </Text>
          )}
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
