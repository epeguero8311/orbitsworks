import { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from "react-native";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/AuthContext";
import { useTheme } from "../lib/ThemeContext";
import { useSiteSession } from "../lib/SiteSessionContext";
import ScreenHeader from "../components/ScreenHeader";

export default function NotesScreen({ navigation }) {
  const { userData, currentUser } = useAuth();
  const { colors } = useTheme();
  const { selectedSite } = useSiteSession();
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!note.trim()) return;
    setSaving(true);
    try {
      const notesRef = collection(db, "companies", userData.companyId, "shiftNotes");
      await addDoc(notesRef, {
        note: note.trim(),
        siteId: selectedSite?.id && selectedSite.id !== "none" ? selectedSite.id : null,
        siteName: selectedSite?.name ?? "Not specified",
        createdByUid: currentUser.uid,
        timestamp: serverTimestamp(),
      });
      setNote("");
      Alert.alert("Saved", "Your note has been saved.");
    } catch (error) {
      console.log("Note save failed:", error);
      Alert.alert("Error", "Couldn't save the note. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScreenHeader title="Reports" onBack={() => navigation.goBack()} />

      <View style={styles.content}>
        <Text style={[styles.label, { color: colors.subtext }]}>
          What happened today?
        </Text>
        <TextInput
          style={[
            styles.input,
            { borderColor: colors.border, color: colors.text, backgroundColor: colors.card },
          ]}
          placeholder="e.g. John left early, called in sick for tomorrow..."
          placeholderTextColor={colors.subtext}
          value={note}
          onChangeText={setNote}
          multiline
          textAlignVertical="top"
        />

        <TouchableOpacity
          style={[styles.saveButton, { backgroundColor: colors.accent }, !note.trim() && { opacity: 0.5 }]}
          onPress={handleSave}
          disabled={!note.trim() || saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>Save Note</Text>
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
    borderWidth: 1, borderRadius: 14, padding: 16, fontSize: 15, minHeight: 160,
  },
  saveButton: { marginTop: 16, borderRadius: 14, paddingVertical: 16, alignItems: "center" },
  saveButtonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});