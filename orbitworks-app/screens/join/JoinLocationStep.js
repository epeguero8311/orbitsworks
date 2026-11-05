import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Feather } from "@expo/vector-icons";
import { getLocationPermissionStatus, requestLocationPermission } from "../../lib/locationPermission";
import { joinStyles as s, BLUE } from "./joinStyles";

// Sign-up step 3 (Phase 6), after Submit and before the PIN screen: a short
// explainer, then the phone's own "While using the app" prompt. Always is
// never asked here - Phase 8 asks for it just in time, after the first Pro
// clock-in at a geofenced job site. Skip is fine - Home shows a banner and
// Settings has the switch.
// Either way (or if location is already on) it moves on with onDone.
export default function JoinLocationStep({ onDone }) {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getLocationPermissionStatus().then(({ status }) => {
      if (status === "granted") onDone();
    });
  }, [onDone]);

  const turnOn = async () => {
    setBusy(true);
    await requestLocationPermission();
    onDone();
  };

  return (
    <View style={s.center}>
      <Feather name="map-pin" size={40} color={BLUE} />
      <Text style={s.centerTitle}>Share your location</Text>
      <Text style={s.body}>
        OrbitsWorks saves where you are when you clock in, clock out and take breaks. If your company uses job site geofences, it can also note when you leave the job site while you are clocked in - only after you agree, and never while you are clocked out.
      </Text>
      <TouchableOpacity style={[s.primary, { paddingHorizontal: 48, marginTop: 0 }]} onPress={turnOn} disabled={busy}>
        <Text style={s.primaryText}>Turn on location</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onDone} disabled={busy} accessibilityRole="button">
        <Text style={s.textLink}>Skip for now</Text>
      </TouchableOpacity>
    </View>
  );
}
