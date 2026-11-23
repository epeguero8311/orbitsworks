import { useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import Logo from "../../components/Logo";
import Spinner from "../../components/Spinner";
import { setScrubValue, clearScrubValues } from "../../lib/sentryScrub";
import { joinStyles as s } from "./joinStyles";

// Welcome: shows the new PIN once. The PIN lives only in the sign-up
// screen's memory - never logged, never in nav params, never on disk - and
// is blanked out of anything sent to Sentry while this is on screen.
// Done signs the worker in (JoinStartScreen); busy shows a spinner on it.
export default function JoinWelcomeStep({ pin, companyName, onDone, busy = false }) {
  useEffect(() => {
    setScrubValue("pin", pin);
    return () => clearScrubValues(["pin"]);
  }, [pin]);

  return (
    <View style={s.center}>
      <Logo size={40} />
      <Text style={s.centerTitle}>Welcome{companyName ? ` to ${companyName}` : ""}!</Text>
      <Text style={s.body}>Your clock-in PIN is:</Text>
      <View style={styles.pinBox}>
        <Text style={styles.pin}>{pin}</Text>
      </View>
      <Text style={s.body}>Write it down or remember it. You'll use it to clock in and out. Next, sign in with your email and password.</Text>
      <TouchableOpacity
        style={[s.primary, { paddingHorizontal: 64, marginTop: 0 }]}
        onPress={onDone}
        disabled={busy}
        accessibilityState={{ disabled: busy, busy }}
      >
        {busy ? <Spinner size={18} color="#fff" /> : <Text style={s.primaryText}>Done</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  pinBox: { backgroundColor: "#eff6ff", borderRadius: 16, paddingVertical: 18, paddingHorizontal: 36, marginBottom: 20 },
  pin: { fontSize: 44, fontWeight: "700", letterSpacing: 12, color: "#1e3a8a", fontVariant: ["tabular-nums"] },
});
