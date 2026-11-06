import { useEffect, useState } from "react";
import {
  Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../lib/ThemeContext";
import { EMPLOYEE_COMMENT_MAX_LENGTH } from "../lib/validators/employeeComment";

// Camera screen's optional comment (ClockCameraScreen): one comment for the
// punch about to be taken - why they're late on a clock-in, why they're
// leaving early on a clock-out. Save Comment keeps the text and returns to
// the camera; Cancel / X close without changing what was saved before.
// Saving an empty box clears the comment. Nothing is written anywhere until
// the photo is taken - the comment rides on that clock event.
// nextType: "in" | "out" | null (null while the screen is still working it
// out - neutral copy).
export default function ClockCommentModal({ visible, initialText, nextType, onSave, onClose }) {
  const { colors } = useTheme();
  const [text, setText] = useState(initialText ?? "");

  // Every opening starts from the last saved comment.
  useEffect(() => {
    if (visible) setText(initialText ?? "");
  }, [visible, initialText]);

  const prompt =
    nextType === "in"
      ? "Running late? Let your manager know why."
      : nextType === "out"
        ? "Leaving early? Let your manager know why."
        : "Add a note for your manager about this punch.";
  const title = nextType === "out" ? "Clock-out comment" : nextType === "in" ? "Clock-in comment" : "Comment";

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={[styles.card, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={24} color={colors.subtext} />
            </TouchableOpacity>
          </View>
          <Text style={[styles.prompt, { color: colors.subtext }]}>{prompt}</Text>
          <TextInput
            style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.card }]}
            placeholder="e.g. Traffic on the highway, got in 15 min late"
            placeholderTextColor={colors.subtext}
            value={text}
            onChangeText={setText}
            maxLength={EMPLOYEE_COMMENT_MAX_LENGTH}
            multiline
            autoFocus
            textAlignVertical="top"
            accessibilityLabel="Comment"
          />
          <Text style={[styles.count, { color: colors.subtext }]}>
            {text.length}/{EMPLOYEE_COMMENT_MAX_LENGTH}
          </Text>
          <TouchableOpacity
            style={[styles.saveButton, { backgroundColor: colors.accent }]}
            onPress={() => onSave(text.trim())}
            accessibilityRole="button"
          >
            <Text style={styles.saveButtonText}>Save Comment</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelButton} onPress={onClose} accessibilityRole="button">
            <Text style={[styles.cancelButtonText, { color: colors.subtext }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: 20 },
  card: { borderRadius: 18, borderWidth: 1, padding: 20 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 18, fontWeight: "700" },
  prompt: { fontSize: 14, marginTop: 6, marginBottom: 12 },
  input: { borderWidth: 1, borderRadius: 14, padding: 14, fontSize: 15, minHeight: 120 },
  count: { fontSize: 12, alignSelf: "flex-end", marginTop: 4 },
  saveButton: { marginTop: 12, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  saveButtonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  cancelButton: { marginTop: 8, paddingVertical: 10, alignItems: "center" },
  cancelButtonText: { fontSize: 15, fontWeight: "600" },
});
