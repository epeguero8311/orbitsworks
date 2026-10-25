import { useRef, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, Linking } from "react-native";
import ConsentCheckbox, { consentTextStyle } from "../../components/join/ConsentCheckbox";
import { getJoinLinks } from "../../lib/pendingJoin";
import { validateEmail, validateFullName, validatePassword, EMAIL_MAX_LENGTH, NAME_MAX_LENGTH, PASSWORD_MAX_LENGTH } from "../../lib/validators/joinSignup";
import { joinStyles as s } from "./joinStyles";

// Screen 1: name, email, password, and the two consents. Both boxes start
// unchecked and both are required. A box counts as checked only for the
// exact version that was on screen when it was ticked (see JoinStartScreen),
// so new consent text from the server un-ticks it.
export default function JoinAccountStep({ info, form, update, privacyChecked, biometricChecked, onToggleConsent, notice, emailError, onContinue }) {
  const [errors, setErrors] = useState({});
  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const appUrl = getJoinLinks()?.appUrl;
  const bothChecked = privacyChecked && biometricChecked;
  const shownEmailError = errors.email || emailError;

  const openPage = (p) => {
    if (appUrl) Linking.openURL(`${appUrl}${p}`).catch(() => {});
  };

  function next() {
    const name = validateFullName(form.fullName);
    const email = validateEmail(form.email);
    const password = validatePassword(form.password);
    const nextErrors = { fullName: name.error, email: email.error, password: password.error };
    setErrors(nextErrors);
    if (!name.ok || !email.ok || !password.ok || !bothChecked) return;
    onContinue();
  }

  return (
    <View>
      {notice ? (
        <View style={s.notice}>
          <Text style={s.noticeText}>{notice}</Text>
        </View>
      ) : null}

      <Text style={s.label}>Full name</Text>
      <TextInput
        style={[s.input, errors.fullName && s.inputError]}
        value={form.fullName}
        onChangeText={(t) => update({ fullName: t })}
        placeholder="First and last name"
        placeholderTextColor="#9ca3af"
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
        maxLength={NAME_MAX_LENGTH}
        returnKeyType="next"
        onSubmitEditing={() => emailRef.current?.focus()}
      />
      {errors.fullName ? <Text style={s.fieldError}>{errors.fullName}</Text> : null}

      <Text style={s.label}>Email</Text>
      <TextInput
        ref={emailRef}
        style={[s.input, shownEmailError && s.inputError]}
        value={form.email}
        onChangeText={(t) => update({ email: t })}
        placeholder="you@example.com"
        placeholderTextColor="#9ca3af"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        maxLength={EMAIL_MAX_LENGTH}
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      {shownEmailError ? <Text style={s.fieldError}>{shownEmailError}</Text> : null}

      <Text style={s.label}>Password</Text>
      <TextInput
        ref={passwordRef}
        style={[s.input, errors.password && s.inputError]}
        value={form.password}
        onChangeText={(t) => update({ password: t })}
        placeholder="At least 8 characters"
        placeholderTextColor="#9ca3af"
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="new-password"
        textContentType="newPassword"
        maxLength={PASSWORD_MAX_LENGTH}
      />
      {errors.password ? <Text style={s.fieldError}>{errors.password}</Text> : null}

      <View style={s.consentBox}>
        <ConsentCheckbox checked={privacyChecked} onToggle={() => onToggleConsent("privacy")}>
          <Text style={consentTextStyle}>
            I have read and agree to the{" "}
            <Text style={s.link} onPress={() => openPage("/privacy")}>
              Privacy Policy
            </Text>
            .
          </Text>
        </ConsentCheckbox>
      </View>

      <View style={s.consentBox}>
        <Text style={s.consentHeading}>Face check consent</Text>
        <Text style={s.consentBody}>{info.biometricConsentText}</Text>
        <Text style={[s.consentBody, { marginTop: 8 }]}>
          <Text style={s.link} onPress={() => openPage("/biometric-policy")}>
            Read the Biometric Data Policy
          </Text>
        </Text>
        <ConsentCheckbox checked={biometricChecked} onToggle={() => onToggleConsent("biometric")}>
          <Text style={consentTextStyle}>I agree to the face check consent above.</Text>
        </ConsentCheckbox>
      </View>

      <TouchableOpacity
        style={[s.primary, !bothChecked && s.primaryDisabled]}
        onPress={next}
        disabled={!bothChecked}
        accessibilityState={{ disabled: !bothChecked }}
      >
        <Text style={s.primaryText}>Continue</Text>
      </TouchableOpacity>
      {!bothChecked ? <Text style={[s.hint, { textAlign: "center" }]}>Check both boxes to continue.</Text> : null}
    </View>
  );
}
