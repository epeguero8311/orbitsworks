import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, BackHandler } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth } from "../lib/firebase";
import { clearPendingJoinToken, getPendingJoinKind, getPendingJoinToken, subscribePendingJoin } from "../lib/pendingJoin";
import { useJoinInfo } from "../lib/hooks/useJoinInfo";
import { useJoinSubmit } from "../lib/hooks/useJoinSubmit";
import { useJoinPrefill } from "../lib/hooks/useJoinPrefill";
import { validateEmail, validateFullName } from "../lib/validators/joinSignup";
import { setScrubValue, clearScrubValues } from "../lib/sentryScrub";
import { finishJoinSignIn, watchForHomeSwitch, setLoginPrefill, SIGN_IN_MESSAGES } from "../lib/joinSignIn";
import Spinner from "../components/Spinner";
import SelfieCamera from "../components/join/SelfieCamera";
import JoinStatusView from "./join/JoinStatusView";
import JoinAccountStep from "./join/JoinAccountStep";
import JoinDetailsStep from "./join/JoinDetailsStep";
import JoinWelcomeStep from "./join/JoinWelcomeStep";
import JoinLocationStep from "./join/JoinLocationStep";
import { joinStyles as s, BLUE } from "./join/joinStyles";

// Sign-up for a crew code (kind "qr": in-app scanner or phone camera link)
// or an email invite (kind "invite", Phase 3B: the /i/ link in the email).
// The token and kind are read from lib/pendingJoin.js (memory only). Both
// kinds use these same steps; only the calls and wording differ. On an
// invite the subcontractor dropdown starts on the company, and the email
// must be the invited one (checked server-side).
//
// Invite autofill (Phase 5d): getInviteInfo also sends what the invite
// knows (useJoinPrefill): the invited email (shown read-only), and for
// "Invite to app" the employee's name (editable - a new name is saved to
// the employee at sign-up), birthday and subcontractor. If it isn't there
// the form is empty, as before.
//
// One screen runs every step in its own state - no nav params - so the
// password, birthday, selfie and PIN never land in navigation state or
// Sentry breadcrumbs, and nothing is lost when a submit fails:
//   getJoinInfo -> loading | dead end | Retry
//   "account"   Screen 1: name, email, password, two consents
//   "details"   Screen 2: subcontractor, birthday, selfie, Submit
//   "camera"    full-screen live selfie
//   "location"  Screen 3 (Phase 6): explainer + "While using" prompt, Skip ok
//   "welcome"   PIN; Done signs in with the email/password from the form
//   "switching" signed in, waiting for the app to switch to EmployeeHome
//
// Nothing signs in before Done: joinCompany creates the login on the
// server, so currentUser stays null and this logged-out stack (with the
// Welcome screen) stays mounted until Done's sign-in.
const SCRUB_KEYS = ["email", "password", "birthday", "doneEmail", "donePassword"];

const EMPTY_FORM = Object.freeze({
  fullName: "",
  email: "",
  password: "",
  // The consent version that was on screen when each box was ticked (null =
  // unticked). A box only counts as ticked for the version shown now.
  privacyVersion: null,
  biometricVersion: null,
  subcontractorId: undefined,
  birthday: { mm: "", dd: "", yyyy: "" },
  selfie: null, // { uri, base64 }
});

// Invite: the dropdown starts on the company (null) instead of unpicked.
function emptyForm(kind) {
  return kind === "invite" ? { ...EMPTY_FORM, subcontractorId: null } : EMPTY_FORM;
}

const INVITE_EMAIL_HINT = "Use the email address your invite was sent to.";
const INVITE_EMAIL_LOCKED_HINT = "This is the email your invite was sent to.";

function deleteLocalPhoto(selfie) {
  if (selfie && selfie.uri) FileSystem.deleteAsync(selfie.uri, { idempotent: true }).catch(() => {});
}

export default function JoinStartScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  // Token and kind change together (setPendingJoinToken sets both before
  // telling listeners), so they're kept as one value.
  const [link, setLink] = useState(() => ({ token: getPendingJoinToken(), kind: getPendingJoinKind() }));
  const { token, kind } = link;
  const { phase, info, reload, markInactive } = useJoinInfo(token, kind);
  const { sending, submit } = useJoinSubmit(kind);
  const [step, setStep] = useState("account");
  const [form, setForm] = useState(() => emptyForm(kind));
  const { emailLocked, nameFromPrefill } = useJoinPrefill({ token, kind, info, setForm });
  const [notice, setNotice] = useState(null);
  const [emailError, setEmailError] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  const [result, setResult] = useState(null); // { pin, companyName }
  // Email/password kept for Done only (memory, no re-render, never in
  // state, nav params or storage). Cleared the moment Done starts.
  const credsRef = useRef(null);
  const doneLock = useRef(false);
  const cancelHomeWatch = useRef(null);
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => subscribePendingJoin((t) => setLink({ token: t, kind: getPendingJoinKind() })), []);

  const update = useCallback((patch) => {
    setForm((f) => ({ ...f, ...patch }));
    if ("email" in patch) setEmailError(null);
  }, []);

  // Backstop: keep these out of Sentry while this screen is open.
  useEffect(() => {
    setScrubValue("email", form.email.trim());
    setScrubValue("password", form.password);
    const b = form.birthday;
    setScrubValue("birthday", b.yyyy.length === 4 && b.mm && b.dd ? `${b.yyyy}-${b.mm.padStart(2, "0")}-${b.dd.padStart(2, "0")}` : null);
  }, [form.email, form.password, form.birthday]);
  useEffect(
    () => () => {
      credsRef.current = null;
      if (cancelHomeWatch.current) cancelHomeWatch.current();
      clearScrubValues(SCRUB_KEYS);
    },
    []
  );

  const privacyChecked = !!info && form.privacyVersion === info.privacyPolicyVersion;
  const biometricChecked = !!info && form.biometricVersion === info.biometricConsentVersion;

  const toggleConsent = (which) => {
    if (!info) return;
    if (which === "privacy") update({ privacyVersion: privacyChecked ? null : info.privacyPolicyVersion });
    else update({ biometricVersion: biometricChecked ? null : info.biometricConsentVersion });
  };

  const exit = useCallback(() => {
    deleteLocalPhoto(form.selfie);
    navigation.reset({ index: 0, routes: [{ name: "Login" }] });
    clearPendingJoinToken();
  }, [navigation, form.selfie]);

  const back = useCallback(() => {
    if (sending) return true;
    if (step === "camera") setStep("details");
    else if (step === "details") setStep("account");
    else if (step === "location" || step === "welcome" || step === "switching") return true;
    else exit();
    return true;
  }, [step, sending, exit]);
  const toWelcome = useCallback(() => setStep("welcome"), []);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", back);
    return () => sub.remove();
  }, [back]);

  // Sign-in failed or never reached EmployeeHome: Login with the email
  // filled in and a plain message. Drops the PIN and credentials first.
  const goToLogin = useCallback(
    (email, message) => {
      credsRef.current = null;
      clearScrubValues(["doneEmail", "donePassword"]);
      setResult(null);
      setLoginPrefill(email, message);
      exit();
    },
    [exit]
  );

  const startHomeWatch = (email) => {
    cancelHomeWatch.current = watchForHomeSwitch({
      onTimeout: () => {
        signOut(auth)
          .catch(() => {})
          .finally(() => goToLogin(email, SIGN_IN_MESSAGES.ready));
      },
    });
  };

  async function onDone() {
    if (doneLock.current) return;
    doneLock.current = true;
    const creds = credsRef.current;
    credsRef.current = null;
    setSigningIn(true);
    const res = await finishJoinSignIn({
      email: creds ? creds.email : "",
      password: creds ? creds.password : "",
      signIn: (e, p) => signInWithEmailAndPassword(auth, e, p),
    });
    clearScrubValues(["donePassword"]);
    if (!res.ok) {
      goToLogin(res.email, res.message);
      return;
    }
    // Signed in. AuthContext now switches the app to EmployeeHome, which
    // unmounts this screen (and cancels the watch). Drop the PIN now.
    setResult(null);
    setStep("switching");
    startHomeWatch(creds.email);
  }

  const onCaptured = (photo) => {
    deleteLocalPhoto(form.selfie);
    update({ selfie: photo });
    setSubmitError(null);
    setStep("details");
  };

  async function onSubmit({ birthday, subcontractorId }) {
    if (sending || !info) return;
    setSubmitError(null);
    // The consent text can change under them (a reload after Retry); the
    // boxes then no longer count as ticked.
    if (!privacyChecked || !biometricChecked) {
      setNotice("The privacy policy or face check consent was updated. Please read it and check the boxes again.");
      setStep("account");
      return;
    }
    const name = validateFullName(form.fullName);
    const email = validateEmail(form.email);
    const res = await submit({
      token,
      fullName: name.value,
      email: email.value,
      password: form.password,
      privacyAccepted: true,
      privacyVersion: form.privacyVersion,
      biometricConsentAccepted: true,
      biometricConsentVersion: form.biometricVersion,
      birthday,
      subcontractorId,
      selfieBase64: form.selfie.base64,
      // 5d: only when the name box was filled in from the invite - lets the
      // server save an edited name to the employee. Never sent otherwise.
      ...(kind === "invite" && nameFromPrefill ? { nameFromPrefill: true } : {}),
    });
    if (res.ok) {
      deleteLocalPhoto(form.selfie);
      credsRef.current = { email: email.value, password: form.password };
      setScrubValue("doneEmail", email.value);
      setScrubValue("donePassword", form.password);
      setForm(emptyForm(kind));
      setResult({ pin: res.pin, companyName: res.companyName || info.companyName });
      setStep("location");
      return;
    }
    if (res.kind === "busy") return;
    if (res.kind === "inactive") {
      markInactive();
      return;
    }
    if (res.kind === "consent") {
      // New text on the server: fetch it, untick both boxes (they no longer
      // match the version shown) and send them back to Screen 1.
      const fresh = await reload();
      if (fresh && fresh.status === "active") {
        update({ privacyVersion: null, biometricVersion: null });
        setNotice(res.message);
        setStep("account");
      }
      return;
    }
    if (res.kind === "email") {
      setEmailError(res.message);
      setStep("account");
      return;
    }
    if (res.kind === "subcontractor") {
      const fresh = await reload();
      if (fresh && fresh.status === "active") {
        update({ subcontractorId: undefined });
        setSubmitError(res.message);
        setStep("details");
      }
      return;
    }
    setSubmitError(res.message);
  }

  if (step === "switching") {
    return (
      <View style={[s.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={s.center}>
          <Spinner size={32} />
          <Text style={[s.body, { marginTop: 16 }]}>Signing you in...</Text>
        </View>
      </View>
    );
  }
  if (step === "location") {
    return (
      <View style={[s.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <JoinLocationStep onDone={toWelcome} />
      </View>
    );
  }
  if (step === "welcome") {
    // result is null only for the moment between goToLogin and the reset.
    return (
      <View style={[s.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        {result ? <JoinWelcomeStep pin={result.pin} companyName={result.companyName} onDone={onDone} busy={signingIn} /> : null}
      </View>
    );
  }
  if (!token) return <JoinStatusView phase="inactive" onExit={exit} source={kind} />;
  if (phase !== "active" || !info) return <JoinStatusView phase={phase} onRetry={reload} onExit={exit} source={kind} />;
  if (step === "camera") return <SelfieCamera onCaptured={onCaptured} onCancel={() => setStep("details")} />;

  const isAccount = step === "account";
  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[s.topBar, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={s.back} onPress={back} disabled={sending} accessibilityRole="button" accessibilityLabel="Back">
          <Feather name="chevron-left" size={22} color={BLUE} />
          <Text style={s.backText}>{isAccount ? "Cancel" : "Back"}</Text>
        </TouchableOpacity>
        <Text style={s.stepText}>Step {isAccount ? 1 : 2} of 2</Text>
      </View>
      <ScrollView contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled">
        <Text style={s.company}>Joining {info.companyName}</Text>
        <Text style={s.title}>{isAccount ? "Create your account" : "A few more details"}</Text>
        {isAccount ? (
          <JoinAccountStep
            info={info}
            form={form}
            update={update}
            privacyChecked={privacyChecked}
            biometricChecked={biometricChecked}
            onToggleConsent={toggleConsent}
            notice={notice}
            emailError={emailError}
            emailHint={kind === "invite" ? (emailLocked ? INVITE_EMAIL_LOCKED_HINT : INVITE_EMAIL_HINT) : null}
            emailLocked={emailLocked}
            onContinue={() => {
              setNotice(null);
              setStep("details");
            }}
          />
        ) : (
          <JoinDetailsStep
            info={info}
            form={form}
            update={update}
            onOpenCamera={() => setStep("camera")}
            onSubmit={onSubmit}
            sending={sending}
            submitError={submitError}
          />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
