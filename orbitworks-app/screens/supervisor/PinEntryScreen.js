import { useState, useCallback } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Sentry from "@sentry/react-native";
import { useAuth } from "../../lib/AuthContext";
import { lightColors as colors, radii, spacing, fontSizes } from "../../lib/theme";
import { useSiteSession } from "../../lib/SiteSessionContext";
import { useCompanySettings } from "../../lib/hooks/useCompanySettings";
import { findEmployeeByPin } from "../../lib/clockLogic";
import { syncPinTable } from "../../lib/pinSync";
import BackBar from "../../components/ui/BackBar";
import PinPad from "../../components/ui/PinPad";

export default function PinEntryScreen({ navigation }) {
  const { userData } = useAuth();
  const insets = useSafeAreaInsets();
  const { selectedSite } = useSiteSession();
  const { settings } = useCompanySettings(userData?.companyId);
  const [pin, setPin] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  // The in/out decision below (findEmployeeByPin -> getCurrentLocalStatus
  // in ClockCameraScreen) reads purely local state, by design - clocking
  // in/out must never block on a network round-trip. But that local cache
  // (pin_cache.lastEventType) otherwise only refreshes on app foreground/
  // login/reconnect/a 20-minute timer (usePinTableSync.js) - too slow for
  // a supervisor who clocks several employees in a row with the app held
  // open the whole time. A clock-out recorded elsewhere (the web admin
  // dashboard, another device) in that window would be invisible here,
  // so the next clock-IN attempt gets evaluated against stale "still in"
  // state and submits another OUT instead - looking like it "did
  // nothing." Each fresh visit to this screen (popToTop sends every
  // clock-in/out back here) is the natural checkpoint to refresh before
  // the next PIN is even typed - best-effort/fire-and-forget, same as
  // every other syncPinTable call site, so a slow/offline network never
  // blocks the keypad.
  useFocusEffect(
    useCallback(() => {
      syncPinTable().catch(() => {});
    }, [])
  );

  const siteLabel = selectedSite
    ? selectedSite.id === "none"
      ? "No Site"
      : selectedSite.name
    : "All Sites";

  const handleKeyPress = async (key) => {
    if (checking) return;
    setError("");

    if (key === "del") {
      setPin((p) => p.slice(0, -1));
      return;
    }
    if (key === "") return;

    Haptics.selectionAsync();

    const next = pin + key;
    setPin(next);

    if (next.length === 4) {
      setChecking(true);
      try {
        const employee = await findEmployeeByPin(userData.companyId, next);

        if (!employee) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          setError("PIN not recognized");
          setPin("");
          return;
        }

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        navigation.navigate("ClockCamera", { employee });
        setPin("");
      } catch (err) {
        // Previously unhandled - a throw here (e.g. a local SQLite read
        // failure) left `checking` stuck true forever with no error
        // shown, since nothing after the await ever ran. The lockout
        // throw from findEmployeeByPin is expected/user-facing, not a
        // bug, so it's shown but not reported.
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setError(err.message || "Something went wrong. Try again.");
        setPin("");
        if (!err.message?.startsWith("Too many attempts")) {
          Sentry.captureException(err, {
            tags: { area: "pinEntry" },
            contexts: { clockAttempt: { companyId: userData?.companyId } },
          });
        }
      } finally {
        setChecking(false);
      }
    }
  };

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom + spacing.lg }]}>
      <BackBar title="Clock In / Out" onBack={() => navigation.goBack()} />
      <PinPad
        title="Enter your PIN"
        top={
          <View style={styles.sitePill}>
            <Feather name="map-pin" size={13} color={colors.accent} />
            <Text style={styles.sitePillText}>{siteLabel}</Text>
          </View>
        }
        length={pin.length}
        onDigit={handleKeyPress}
        onDelete={() => handleKeyPress("del")}
        busy={checking}
        message={error}
        shakeKey={error}
      />
      {settings.appSettings.allowSupervisorOverride && (
        <TouchableOpacity style={styles.overrideButton} onPress={() => navigation.navigate("OverridePinEntry")}>
          <Text style={styles.overrideButtonText}>Supervisor override</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  sitePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radii.pill,
    backgroundColor: colors.accentSoft,
    marginBottom: spacing.lg,
  },
  sitePillText: { fontSize: fontSizes.sm, fontWeight: "600", color: colors.accent },
  overrideButton: {
    alignSelf: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 44,
    justifyContent: "center",
    borderRadius: radii.md,
    backgroundColor: colors.accent,
  },
  overrideButtonText: { fontSize: fontSizes.sm, fontWeight: "700", color: colors.onColor },
});
