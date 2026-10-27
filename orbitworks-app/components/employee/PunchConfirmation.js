import { useEffect } from "react";
import { View, Text, Image, Pressable, StyleSheet } from "react-native";

const AUTO_CLOSE_MS = 3000;

// Green confirmation after a punch: what happened, the time, the site and
// (clock in/out) a small thumbnail of the photo. Closes on its own after
// about 3 seconds, or on tap.
export default function PunchConfirmation({ title, timeLabel, siteName, photoUri, onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, AUTO_CLOSE_MS);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <Pressable style={styles.container} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
      <View style={styles.checkCircle}>
        <Text style={styles.check}>{"\u2713"}</Text>
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.time}>{timeLabel}</Text>
      {siteName ? <Text style={styles.site}>{siteName}</Text> : null}
      {photoUri ? <Image source={{ uri: photoUri }} style={styles.thumb} /> : null}
      <Text style={styles.hint}>Tap to close</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { ...StyleSheet.absoluteFillObject, backgroundColor: "#16a34a", alignItems: "center", justifyContent: "center", padding: 24 },
  checkCircle: { width: 96, height: 96, borderRadius: 48, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", marginBottom: 20 },
  check: { color: "#16a34a", fontSize: 48, fontWeight: "700" },
  title: { color: "#fff", fontSize: 26, fontWeight: "800" },
  time: { color: "#fff", fontSize: 20, fontWeight: "600", marginTop: 6 },
  site: { color: "#dcfce7", fontSize: 16, marginTop: 4 },
  thumb: { width: 72, height: 72, borderRadius: 36, marginTop: 18, borderWidth: 2, borderColor: "#fff" },
  hint: { color: "#dcfce7", fontSize: 13, marginTop: 24 },
});
