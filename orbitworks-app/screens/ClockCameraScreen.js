import { useState, useRef, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, FlatList } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons, Feather } from "@expo/vector-icons";
import * as Sentry from "@sentry/react-native";
import { useAuth } from "../lib/AuthContext";
import { useTheme } from "../lib/ThemeContext";
import { useSiteSession } from "../lib/SiteSessionContext";
import { useCompanySettings } from "../lib/hooks/useCompanySettings";
import { queueClockEvent } from "../lib/clockQueue";
import { drainQueue } from "../lib/queueSync";
import { getBestEffortLocationIfPro } from "../lib/location";
import { getCurrentLocalStatus, getCurrentLocalSite } from "../lib/clockStatusLocal";
import { isAutoDetectionActive, getSitesForEmployeePicker, detectLocalSite } from "../lib/geofenceCheck";
import ScreenHeader from "../components/ScreenHeader";

export default function ClockCameraScreen({ route, navigation }) {
  const { employee } = route.params;
  const { userData, currentUser } = useAuth();
  const { colors } = useTheme();
  const { selectedSite } = useSiteSession();
  const { isPro, settings } = useCompanySettings(userData?.companyId);
  const [permission, requestPermission] = useCameraPermissions();
  const [submitting, setSubmitting] = useState(false);
  // "Ask for job site each time" (App Settings on the website) - forces a
  // pick before the camera ever shows, for a clock-IN only (a clock-out
  // always keeps the session's existing site - see handleCapture). Wins
  // over Pro geofencing auto-detection too when the admin has it on. null
  // while being determined; [] once determined the gate doesn't apply (or
  // the company has no sites to offer at all).
  const [siteOptions, setSiteOptions] = useState(null);
  const [pickedSite, setPickedSite] = useState(null);
  const cameraRef = useRef(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function resolveSiteGate() {
      const currentStatus = await getCurrentLocalStatus(employee.id);
      const nextType = currentStatus === "out" ? "in" : "out";
      // Takes priority over Pro geofencing auto-detection (see
      // handleCapture) - an admin explicitly turning this on means a
      // manual pick every time, even on a company with located sites.
      const required = nextType === "in" && settings.appSettings.askJobSiteEachTime;
      const options = required ? await getSitesForEmployeePicker(employee) : [];
      if (!cancelled) setSiteOptions(options);
    }
    resolveSiteGate();
    return () => {
      cancelled = true;
    };
  }, [employee, settings.appSettings.askJobSiteEachTime]);

  if (!permission) {
    return <View style={styles.center}><ActivityIndicator color="#3b6fe0" /></View>;
  }
  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.permText}>Camera access is needed to clock in.</Text>
        <TouchableOpacity style={styles.permButton} onPress={requestPermission}>
          <Text style={styles.permButtonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (siteOptions === null) {
    return <View style={styles.center}><ActivityIndicator color="#3b6fe0" /></View>;
  }

  if (siteOptions.length > 0 && !pickedSite) {
    // "All Sites" (id "none") is the explicit bail-out - the operator can
    // still pick it to tag the clock-in as not tied to a specific site,
    // same "none" convention as SiteSession's own "No Site" option (see
    // handleCapture, which maps it to siteId: null / "Not specified").
    const pickerData = [{ id: "none", name: "All Sites" }, ...siteOptions];
    return (
      <View style={[styles.pickerContainer, { backgroundColor: colors.background }]}>
        <ScreenHeader title={`${employee.name}'s Job Site`} onBack={() => navigation.goBack()} />
        <FlatList
          data={pickerData}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.pickerList}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.pickerRow, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => setPickedSite(item)}
            >
              <Text style={[styles.pickerName, { color: colors.text }]}>{item.name}</Text>
              <Feather name="chevron-right" size={20} color={colors.subtext} />
            </TouchableOpacity>
          )}
        />
      </View>
    );
  }

  const handleCapture = async () => {
    if (!cameraRef.current || submitting) return;
    setSubmitting(true);
    try {
      // Runs concurrently with the photo capture (not before/after it) so
      // a slow GPS fix never adds to the time this button already takes -
      // getBestEffortLocationIfPro has its own internal timeout and never
      // throws, and resolves to undefined immediately for a Core company.
      const [photo, location] = await Promise.all([
        cameraRef.current.takePictureAsync({ quality: 0.5 }),
        getBestEffortLocationIfPro(isPro),
      ]);

      const currentStatus = await getCurrentLocalStatus(employee.id);
      const nextType = currentStatus === "out" ? "in" : "out";

      // Geofencing (Pro) auto site detection - once a Pro company has any
      // active, located site at all (fenced or not - Geofencing Part 5),
      // there's no site picker: the app finds the site itself instead of
      // trusting SiteSessionContext's selectedSite. A company with no
      // located sites (or Core) keeps today's exact flow. "Ask for job
      // site each time" (below) takes priority over all of this when an
      // admin has explicitly turned it on - a manual pick every time,
      // even on a company with located sites.
      const autoDetect = isPro && (await isAutoDetectionActive());
      const askJobSite = settings.appSettings.askJobSiteEachTime;

      let siteId;
      let siteName;
      if (askJobSite) {
        // Same clock-out convention as the geofence branch below: keep
        // the clock-in's site, never re-ask mid-session. The clock-IN
        // case was already forced through the picker above (see the
        // siteOptions/pickedSite gate before the camera ever shows), so
        // pickedSite is set unless the company had no sites to offer.
        if (nextType === "out") {
          const lastSite = await getCurrentLocalSite(employee.id);
          siteId = lastSite.siteId;
          siteName = lastSite.siteName || "Not specified";
        } else {
          const isNone = !pickedSite || pickedSite.id === "none";
          siteId = isNone ? null : pickedSite.id;
          siteName = isNone ? "Not specified" : pickedSite.name;
        }
      } else if (autoDetect) {
        if (nextType === "out") {
          // A clock-out always keeps the clock-in's site, never re-detects
          // (see lib/clockStatusLocal.js's getCurrentLocalSite).
          const lastSite = await getCurrentLocalSite(employee.id);
          siteId = lastSite.siteId;
          siteName = lastSite.siteName || "Not specified";
        } else {
          // Optimistic guess across every located site - the server's own
          // detectSite is the final say once this syncs.
          const detected = await detectLocalSite(
            location?.lat != null && location?.lng != null ? location : null,
            location?.accuracyM ?? null
          );
          siteId = detected.siteId;
          siteName = detected.siteName;
        }
      } else {
        const isNone = selectedSite?.id === "none";
        siteId = !selectedSite || isNone ? null : selectedSite.id;
        siteName = !selectedSite ? "Not specified" : isNone ? "Not specified" : selectedSite.name;
      }

      // Local-first: this only touches the filesystem and SQLite, no
      // network, so it resolves near-instantly whether online or not.
      const resultType = await queueClockEvent({
        employee,
        photoUri: photo.uri,
        source: "pin",
        createdByUid: currentUser.uid,
        siteId,
        siteName,
        location,
      });
      // Fire-and-forget: if there is signal right now this starts
      // uploading immediately in the background. If not, useQueueSync
      // will pick it up on the next reconnect/foreground. Either way we
      // do not wait for it before confirming to the user.
      drainQueue(userData.companyId);

      // Guard: if the user backed out (impossible right now since back
      // is disabled while submitting, but this also covers the screen
      // being torn down by a parent navigator reset), never fire a
      // navigation against an unmounted screen — that's what corrupts
      // the *next* employee's clock-in flow.
      if (!isMounted.current) return;
      navigation.replace("ClockConfirm", { employeeName: employee.name, resultType });
    } catch (error) {
      console.log("Clock event failed:", error);
      // A deactivated employee trying to clock in is a genuine decline, not
      // a technical failure - route it through the same declined screen
      // (and local decline log) as a geofence block, instead of silently
      // resetting the button with no feedback at all.
      if (error?.code === "employeeDeactivated") {
        if (!isMounted.current) return;
        navigation.replace("ClockDeclined", { employee, message: error.message });
        return;
      }

      // This is the only local write attempt for a self clock-in/out -
      // if it throws, nothing was recorded anywhere (not even locally),
      // and until now nothing surfaced that beyond this console.log lost
      // the moment the app restarts. Report it so a real failure here
      // (vs. e.g. the user backing out) is finally visible.
      Sentry.captureException(error, {
        tags: { area: "clockCamera" },
        contexts: {
          clockAttempt: {
            employeeId: employee?.id,
            companyId: userData?.companyId,
            siteId,
          },
        },
      });
      if (isMounted.current) setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={styles.camera} facing="front" />

      <TouchableOpacity
        style={[styles.backButton, submitting && styles.backButtonDisabled]}
        onPress={() => !submitting && navigation.goBack()}
        disabled={submitting}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <Ionicons name="chevron-back" size={26} color="#fff" />
      </TouchableOpacity>

      <View style={styles.overlay}>
        <Text style={styles.name}>{employee.name}</Text>
        <TouchableOpacity style={styles.captureButton} onPress={handleCapture} disabled={submitting}>
          {submitting ? <ActivityIndicator color="#fff" /> : <View style={styles.captureInner} />}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  camera: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  permText: { textAlign: "center", marginBottom: 16, color: "#333" },
  permButton: { backgroundColor: "#3b6fe0", padding: 14, borderRadius: 8 },
  permButtonText: { color: "#fff", fontWeight: "600" },
  backButton: {
    position: "absolute", top: 50, left: 16, width: 44, height: 44,
    borderRadius: 22, backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center", alignItems: "center",
  },
  backButtonDisabled: { opacity: 0.3 },
  overlay: { position: "absolute", bottom: 40, width: "100%", alignItems: "center" },
  name: { color: "#fff", fontSize: 18, fontWeight: "600", marginBottom: 16 },
  captureButton: {
    width: 72, height: 72, borderRadius: 36, borderWidth: 4,
    borderColor: "#fff", justifyContent: "center", alignItems: "center",
  },
  captureInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: "#fff" },
  pickerContainer: { flex: 1 },
  pickerList: { padding: 20 },
  pickerRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    padding: 18, borderRadius: 14, borderWidth: 1.5, marginBottom: 12,
  },
  pickerName: { fontSize: 16, fontWeight: "600" },
});