import { useState } from "react";
import { View, Text, TouchableOpacity, Image, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import BirthdayBoxes from "../../components/join/BirthdayBoxes";
import SubcontractorPicker from "../../components/join/SubcontractorPicker";
import Spinner from "../../components/Spinner";
import { checkBirthday } from "../../lib/validators/joinSignup";
import { joinStyles as s, BLUE } from "./joinStyles";

// Screen 2: who you work for, birthday, live selfie, then Submit.
// The dropdown only shows when the code lists subcontractors; otherwise the
// person joins the company itself (subcontractorId null).
export default function JoinDetailsStep({ info, form, update, onOpenCamera, onSubmit, sending, submitError }) {
  const [errors, setErrors] = useState({});
  const hasSubs = info.subcontractors.length > 0;
  const options = hasSubs
    ? [{ id: null, label: `${info.companyName} (direct)` }, ...info.subcontractors.map((x) => ({ id: x.id, label: x.name }))]
    : [];

  function submit() {
    if (sending) return;
    const bday = checkBirthday(form.birthday, info.minSignupAge);
    const nextErrors = {
      sub: hasSubs && form.subcontractorId === undefined ? "Choose who you work for." : null,
      birthday: bday.ok ? null : bday.error,
      selfie: form.selfie ? null : "Take your selfie.",
    };
    setErrors(nextErrors);
    if (nextErrors.sub || nextErrors.birthday || nextErrors.selfie) return;
    onSubmit({ birthday: bday.iso, subcontractorId: hasSubs ? form.subcontractorId : null });
  }

  return (
    <View>
      {hasSubs ? (
        <>
          <Text style={s.label}>Who do you work for?</Text>
          <SubcontractorPicker
            options={options}
            selected={form.subcontractorId}
            onSelect={(id) => update({ subcontractorId: id })}
            disabled={sending}
          />
          {errors.sub ? <Text style={s.fieldError}>{errors.sub}</Text> : null}
        </>
      ) : null}

      <Text style={s.label}>Date of birth</Text>
      <BirthdayBoxes value={form.birthday} onChange={(b) => update({ birthday: b })} editable={!sending} />
      {errors.birthday ? <Text style={s.fieldError}>{errors.birthday}</Text> : null}

      <Text style={s.label}>Selfie</Text>
      <Text style={[s.hint, { marginTop: 0, marginBottom: 10 }]}>Used to check it's you when you clock in.</Text>
      {form.selfie ? (
        <View style={styles.previewRow}>
          <Image source={{ uri: form.selfie.uri }} style={styles.preview} />
          <TouchableOpacity style={[s.secondary, styles.retake]} onPress={onOpenCamera} disabled={sending}>
            <Text style={s.secondaryText}>Retake</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={styles.takeButton} onPress={onOpenCamera} disabled={sending}>
          <Feather name="camera" size={22} color={BLUE} />
          <Text style={styles.takeText}>Take selfie</Text>
        </TouchableOpacity>
      )}
      {errors.selfie ? <Text style={s.fieldError}>{errors.selfie}</Text> : null}

      {submitError ? (
        <View style={s.errorBox}>
          <Text style={s.errorBoxText}>{submitError}</Text>
        </View>
      ) : null}

      <TouchableOpacity
        style={[s.primary, sending && s.primaryDisabled]}
        onPress={submit}
        disabled={sending}
        accessibilityState={{ disabled: sending, busy: sending }}
      >
        {sending ? (
          <View style={styles.sendingRow}>
            <Spinner size={18} color="#fff" />
            <Text style={[s.primaryText, { marginLeft: 10 }]}>Signing you up...</Text>
          </View>
        ) : (
          <Text style={s.primaryText}>Sign up</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  previewRow: { flexDirection: "row", alignItems: "center" },
  preview: { width: 120, height: 160, borderRadius: 12, backgroundColor: "#e5e7eb", marginRight: 18 },
  retake: { paddingHorizontal: 24 },
  takeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: BLUE,
    borderRadius: 12,
    paddingVertical: 22,
  },
  takeText: { color: BLUE, fontSize: 16, fontWeight: "600", marginLeft: 10 },
  sendingRow: { flexDirection: "row", alignItems: "center" },
});
