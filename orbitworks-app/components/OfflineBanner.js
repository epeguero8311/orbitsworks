import { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text } from "react-native";
import { Feather } from "@expo/vector-icons";
import NetInfo from "@react-native-community/netinfo";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";

// Persistent bottom banner, visible only while offline. isConnected
// covers "no network at all"; isInternetReachable catches the "on wifi
// but the router has no real uplink" case too - that combination is
// what "bad or no connection" actually means on a job site. A null
// isInternetReachable (still checking) is treated as online to avoid a
// flash of the banner on every cold start.
//
// Rendered from DashboardScreen (the Home tab), which sits inside the
// bottom tab navigator added in Phase 1 - useBottomTabBarHeight() gives
// the tab bar's real rendered height (already accounts for safe-area
// insets) so the banner floats just above it instead of colliding with
// or hiding behind it.
// How far below its own resting spot the banner slides when hidden. Must
// clear restingBottom (below) by enough margin that the whole banner is
// off-screen, not just however-far-happens-to-be-enough for one device's
// tab bar height - a fixed 80px here previously left a sliver visible
// once restingBottom grew past ~80 on devices with a taller tab bar/home
// indicator inset.
const HIDE_OFFSET = 160;

export default function OfflineBanner() {
  const tabBarHeight = useBottomTabBarHeight();
  const restingBottom = tabBarHeight + 12;
  const [visible, setVisible] = useState(false);
  const translateY = useRef(new Animated.Value(HIDE_OFFSET)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const sub = NetInfo.addEventListener((state) => {
      const offline = state.isConnected === false || state.isInternetReachable === false;
      setVisible(offline);
    });
    return () => sub();
  }, []);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: visible ? 0 : HIDE_OFFSET,
        duration: 220,
        useNativeDriver: true,
      }),
      // Belt-and-suspenders on top of the slide: even if translateY ever
      // under-clears the resting offset on some device, opacity 0
      // guarantees "hidden" actually means invisible, not just moved.
      Animated.timing(opacity, {
        toValue: visible ? 1 : 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.container, { bottom: restingBottom, opacity, transform: [{ translateY }] }]}
    >
      <Feather name="alert-triangle" size={16} color="#eab308" />
      <Text style={styles.text}>Offline — keep working. We’ll sync when connected.</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 16,
    right: 16,
    backgroundColor: "#3f3f46",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  text: {
    color: "#e4e4e7",
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
  },
});