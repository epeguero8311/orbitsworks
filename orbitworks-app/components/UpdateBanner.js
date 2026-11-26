import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../lib/ThemeContext";
import { useAppUpdate } from "../lib/hooks/useAppUpdate";

// Task 6 (update banner, U1): on top of every mode (supervisor, employee,
// kiosk) once signed in.
//  - banner: "A new version is available (1.1.7) / You're on 1.1.6
//    [Update] [x]"; [x] hides it until tomorrow.
//  - force (below the optional minimum): full screen "Update to continue",
//    no way past it. Drawn OVER the app, so saved punches keep sending
//    underneath.
export default function UpdateBanner({ signedIn }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const update = useAppUpdate(signedIn);

  if (update.kind === "force") {
    return (
      <View style={[StyleSheet.absoluteFill, styles.force, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <Feather name="download" size={48} color={colors.accent} />
        <Text style={[styles.forceTitle, { color: colors.text }]}>Update to continue</Text>
        <Text style={[styles.forceBody, { color: colors.subtext }]}>
          {`This version (${update.current}) is no longer supported. Update to ${update.latest} to keep using OrbitsWorks.`}
        </Text>
        <TouchableOpacity style={[styles.forceButton, { backgroundColor: colors.accent }]} onPress={update.openStore} accessibilityRole="button">
          <Text style={styles.forceButtonText}>Update</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (update.kind !== "banner") return null;
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + 8 }]}>
      <View style={[styles.banner, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Feather name="download" size={20} color={colors.accent} />
        <View style={styles.text}>
          <Text style={[styles.title, { color: colors.text }]}>{`A new version is available (${update.latest})`}</Text>
          <Text style={[styles.sub, { color: colors.subtext }]}>{`You’re on ${update.current}`}</Text>
        </View>
        <TouchableOpacity style={[styles.update, { backgroundColor: colors.accent }]} onPress={update.openStore} accessibilityRole="button">
          <Text style={styles.updateText}>Update</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={update.dismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Dismiss">
          <Feather name="x" size={20} color={colors.subtext} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 12, right: 12, alignItems: "center", zIndex: 50 },
  banner: {
    width: "100%", maxWidth: 560, flexDirection: "row", alignItems: "center", gap: 12,
    borderWidth: 1, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14,
    shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  text: { flex: 1 },
  title: { fontSize: 14, fontWeight: "700" },
  sub: { fontSize: 13, marginTop: 2 },
  update: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  updateText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  force: { zIndex: 100, alignItems: "center", justifyContent: "center", padding: 32, gap: 14 },
  forceTitle: { fontSize: 24, fontWeight: "800", textAlign: "center" },
  forceBody: { fontSize: 16, textAlign: "center", lineHeight: 22, maxWidth: 420 },
  forceButton: { marginTop: 8, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 48 },
  forceButtonText: { color: "#fff", fontSize: 17, fontWeight: "700" },
});
