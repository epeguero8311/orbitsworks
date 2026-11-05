import { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, AppState, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "../../lib/AuthContext";
import { spacing, fontSizes, radii } from "../../lib/theme";
import { useTheme } from "../../lib/ThemeContext";
import { makeStyles } from "../../lib/makeStyles";
import { acceptLocationConsent, fetchLocationConsent } from "../../lib/siteExitApi";
import { isLocationConsentAccepted, setLocationConsentAccepted } from "../../lib/siteTracking";
import { getAlwaysLocationStatus, openLocationSettings, requestAlwaysLocation } from "../../lib/locationPermission";
import { kickTrackingCheck } from "../../lib/siteTrackingEvents";
import { markAlwaysAsked } from "../../lib/alwaysLocationAsk";
import { getJoinLinks } from "../../lib/pendingJoin";
import ScreenHeader from "../../components/ScreenHeader";
import ConsentCheckbox, { consentTextStyle } from "../../components/join/ConsentCheckbox";
import AlwaysWalkthrough from "../../components/employee/AlwaysWalkthrough";
import Spinner from "../../components/Spinner";

// Employee App Phase 8 (D17 + D19): job site alerts on this phone, in up to
// three steps - asked just in time after the first Pro clock-in at a
// geofenced site, or from the Home banner / Settings:
//   consent     - the location tracking consent (text + version from the
//                 server), stored by acceptLocationConsent. Pro employees
//                 accept it before the Always ask.
//   always      - why, then the phone's own prompts (While using, then
//                 Always).
//   walkthrough - the phone won't ask again: the iPhone (or Android) steps
//                 in the phone's Settings, re-checked when they come back.
// "Not now" is always fine: the shift just shows "tracking off" (gray) and
// nothing about a punch changes.
export default function AlwaysLocationScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { userData, linkedEmployeeId } = useAuth();
  const companyId = userData?.companyId;
  const employeeId = linkedEmployeeId || userData?.employeeId;
  const [step, setStep] = useState("loading");
  const [consent, setConsent] = useState(null);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const appUrl = getJoinLinks()?.appUrl;

  const finish = useCallback(() => {
    kickTrackingCheck();
    navigation.goBack();
  }, [navigation]);

  const afterConsent = useCallback(async () => {
    const access = await getAlwaysLocationStatus();
    if (access === "always") finish();
    else setStep("always");
  }, [finish]);

  // Which step to start on.
  useEffect(() => {
    let active = true;
    markAlwaysAsked(companyId, employeeId);
    (async () => {
      const info = await fetchLocationConsent();
      if (!active) return;
      if (!info) {
        // No signal: a consent given before on this phone still counts.
        if (await isLocationConsentAccepted(companyId, employeeId)) await afterConsent();
        else if (active) setStep("offline");
        return;
      }
      setConsent(info);
      await setLocationConsentAccepted(companyId, employeeId, info.accepted === true);
      if (!active) return;
      if (info.accepted) await afterConsent();
      else setStep("consent");
    })();
    return () => {
      active = false;
    };
  }, [companyId, employeeId, afterConsent]);

  // Back from the phone's Settings: Always now = done.
  useEffect(() => {
    if (step !== "walkthrough") return undefined;
    const sub = AppState.addEventListener("change", (s) => {
      if (s !== "active") return;
      getAlwaysLocationStatus().then((access) => {
        if (access === "always") finish();
      });
    });
    return () => sub.remove();
  }, [step, finish]);

  const agree = async () => {
    if (!consent || !checked || busy) return;
    setBusy(true);
    setError("");
    try {
      await acceptLocationConsent({ locationConsentVersion: consent.locationConsentVersion, privacyVersion: consent.privacyVersion });
      await setLocationConsentAccepted(companyId, employeeId, true);
      await afterConsent();
    } catch (err) {
      const reason = err && err.details && err.details.reason;
      if (reason === "consentVersion") {
        const fresh = await fetchLocationConsent();
        if (fresh) setConsent(fresh);
        setChecked(false);
        setError("The consent was updated. Please read it again.");
      } else {
        setError("Couldn't save. Check your signal and try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  const allowAlways = async () => {
    if (busy) return;
    setBusy(true);
    const r = await requestAlwaysLocation();
    setBusy(false);
    if (r.status === "granted") finish();
    else setStep("walkthrough");
  };

  let body;
  if (step === "loading") {
    body = (
      <View style={styles.center}>
        <Spinner size={28} color={colors.accent} />
      </View>
    );
  } else if (step === "offline") {
    body = (
      <>
        <Text style={styles.title}>No signal</Text>
        <Text style={styles.body}>This needs a connection the first time. Try again from Settings when you have signal. Your punches work as normal.</Text>
      </>
    );
  } else if (step === "consent") {
    body = (
      <>
        <Text style={styles.title}>Job site alerts</Text>
        <Text style={styles.body}>
          Your company flags when someone leaves a job site while clocked in. It never stops a clock-in or clock-out and never clocks you out.
        </Text>
        <View style={styles.card}>
          <Text style={styles.cardText}>{consent ? consent.locationConsentText : ""}</Text>
          {appUrl ? (
            <Text style={styles.link} onPress={() => Linking.openURL(`${appUrl}/privacy`).catch(() => {})}>
              Read the Privacy Policy
            </Text>
          ) : null}
          <ConsentCheckbox checked={checked} onToggle={() => setChecked((c) => !c)} disabled={busy}>
            <Text style={consentTextStyle}>I agree to the location consent above.</Text>
          </ConsentCheckbox>
        </View>
        <TouchableOpacity style={[styles.primary, (!checked || busy) && styles.disabled]} onPress={agree} disabled={!checked || busy}>
          <Text style={styles.primaryText}>{busy ? "Saving..." : "Agree"}</Text>
        </TouchableOpacity>
      </>
    );
  } else if (step === "always") {
    body = (
      <>
        <Feather name="map-pin" size={36} color={colors.accent} style={styles.icon} />
        <Text style={styles.title}>Allow &quot;Always&quot; location</Text>
        <Text style={styles.body}>
          So the app can notice when you leave the job site while you are clocked in, even when it is closed. It only runs while you are clocked in, and never saves a trail of where you went.
        </Text>
        <TouchableOpacity style={[styles.primary, busy && styles.disabled]} onPress={allowAlways} disabled={busy}>
          <Text style={styles.primaryText}>Allow Always</Text>
        </TouchableOpacity>
      </>
    );
  } else {
    body = (
      <>
        <Text style={styles.title}>Turn on Always in Settings</Text>
        <Text style={styles.body}>Your phone won&apos;t ask again, so it has to be changed in Settings:</Text>
        <AlwaysWalkthrough />
        <TouchableOpacity style={styles.primary} onPress={openLocationSettings}>
          <Text style={styles.primaryText}>Open Settings</Text>
        </TouchableOpacity>
      </>
    );
  }

  return (
    <View style={[styles.flex, { paddingTop: insets.top }]}>
      <ScreenHeader title="Location" onBack={finish} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}>
        {body}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {step !== "loading" ? (
          <TouchableOpacity onPress={finish} accessibilityRole="button" style={styles.notNow}>
            <Text style={styles.notNowText}>Not now</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  flex: { flex: 1, backgroundColor: colors.background },
  center: { paddingVertical: spacing.xxl, alignItems: "center" },
  content: { padding: spacing.xl, gap: spacing.lg },
  icon: { alignSelf: "center" },
  title: { fontSize: fontSizes.xl, fontWeight: "700", color: colors.text },
  body: { fontSize: fontSizes.md, color: colors.subtext, lineHeight: 22 },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: spacing.lg, gap: spacing.sm },
  cardText: { fontSize: fontSizes.md, color: colors.text, lineHeight: 22 },
  link: { color: colors.accent, fontSize: fontSizes.md, fontWeight: "600" },
  primary: { backgroundColor: colors.accent, borderRadius: radii.md, paddingVertical: 14, alignItems: "center" },
  primaryText: { color: "#fff", fontSize: fontSizes.md, fontWeight: "700" },
  disabled: { opacity: 0.5 },
  error: { color: colors.redStrong, fontSize: fontSizes.sm },
  notNow: { alignSelf: "center", padding: spacing.md },
  notNowText: { color: colors.subtext, fontSize: fontSizes.md, fontWeight: "600" },
}));
