import { useCallback, useEffect, useRef } from "react";
import { Modal, View, Text, Image, Pressable, StyleSheet, useWindowDimensions } from "react-native";
import { StatusBar } from "expo-status-bar";
import { lightColors as colors, radii, spacing, fontSizes } from "../../lib/theme";

const AUTO_CLOSE_MS = 3000;
// The Modal's fade-in, rounded up (iOS ~0.3 s, Android a little less).
const FADE_MS = 350;

// Full-screen green success message (clock in/out, break start/end): check
// mark, title, time, site and an optional photo thumbnail. Closes on any
// tap or by itself after about 3 seconds. note: one extra line under the
// site (an offline punch: "Will sync when online").
//
// It is its own Modal (a separate window) with translucent status and
// navigation bars, so it always covers the whole screen edge to edge -
// status bar, tab bar and system bars included - wherever it's rendered.
// Sizing it with absoluteFill inside a screen only covers that screen's
// content area, which is what left gaps before.
//
// onShown: called once the fade-in is over and the green fully covers the
// screen - the later of the Modal's onShow and FADE_MS (fallback 2x FADE_MS
// if onShow never fires). The screen underneath must not change before
// then, or it shows through the fade (same rule as the supervisor app's
// ClockConfirmScreen, which covers first and changes nothing underneath).
export default function SuccessOverlay({ visible = true, title, timeLabel, siteName, note, photoUri, onClose, onShown }) {
  // Explicit window size as well as flex, so the green can never shrink to
  // its content even if the Modal's own container comes up short.
  const { width, height } = useWindowDimensions();
  const startRef = useRef(0);
  const firedRef = useRef(false);
  const onShownRef = useRef(onShown);
  const timersRef = useRef([]);

  useEffect(() => {
    onShownRef.current = onShown;
  }, [onShown]);

  const fire = useCallback(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    if (onShownRef.current) onShownRef.current();
  }, []);

  useEffect(() => {
    if (!visible) return undefined;
    const timer = setTimeout(onClose, AUTO_CLOSE_MS);
    return () => clearTimeout(timer);
  }, [visible, onClose]);

  useEffect(() => {
    if (!visible) return undefined;
    startRef.current = Date.now();
    firedRef.current = false;
    const timers = timersRef.current;
    timers.push(setTimeout(fire, FADE_MS * 2));
    return () => {
      timers.forEach(clearTimeout);
      timers.length = 0;
    };
  }, [visible, fire]);

  const handleShow = useCallback(() => {
    const left = Math.max(0, FADE_MS - (Date.now() - startRef.current));
    timersRef.current.push(setTimeout(fire, left));
  }, [fire]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onShow={handleShow}
      onRequestClose={onClose}
    >
      <StatusBar style="light" />
      <Pressable
        style={[styles.fill, { width, height }]}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close"
      >
        <View style={styles.checkCircle}>
          <Text style={styles.check}>{"\u2713"}</Text>
        </View>
        <Text style={styles.title}>{title}</Text>
        {timeLabel ? <Text style={styles.time}>{timeLabel}</Text> : null}
        {siteName ? <Text style={styles.site}>{siteName}</Text> : null}
        {note ? <Text style={styles.note}>{note}</Text> : null}
        {photoUri ? <Image source={{ uri: photoUri }} style={styles.thumb} /> : null}
        <Text style={styles.hint}>Tap to close</Text>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    backgroundColor: colors.greenStrong,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xxl,
  },
  checkCircle: {
    width: 96,
    height: 96,
    borderRadius: radii.pill,
    backgroundColor: colors.onColor,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xl,
  },
  check: { color: colors.greenStrong, fontSize: 48, fontWeight: "700" },
  title: { color: colors.onColor, fontSize: 26, fontWeight: "800", textAlign: "center" },
  time: { color: colors.onColor, fontSize: fontSizes.xl, fontWeight: "600", marginTop: 6 },
  site: { color: colors.greenSoft, fontSize: 16, marginTop: spacing.xs, textAlign: "center" },
  note: { color: colors.onColor, fontSize: 16, fontWeight: "700", marginTop: spacing.md, textAlign: "center" },
  thumb: { width: 72, height: 72, borderRadius: 36, marginTop: 18, borderWidth: 2, borderColor: colors.onColor },
  hint: { color: colors.greenSoft, fontSize: fontSizes.sm, marginTop: spacing.xxl },
});
