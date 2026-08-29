import { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text } from "react-native";
import { Feather } from "@expo/vector-icons";
import NetInfo from "@react-native-community/netinfo";

// Persistent bottom banner, visible only while offline. isConnected
// covers "no network at all"; isInternetReachable catches the "on wifi
// but the router has no real uplink" case too - that combination is
// what "bad or no connection" actually means on a job site. A null
// isInternetReachable (still checking) is treated as online to avoid a
// flash of the banner on every cold start.
export default function OfflineBanner() {
  const [visible, setVisible] = useState(false);
  const translateY = useRef(new Animated.Value(80)).current;

  useEffect(() => {
    const sub = NetInfo.addEventListener((state) => {
      const offline = state.isConnected === false || state.isInternetReachable === false;
      setVisible(offline);
    });
    return () => sub();
  }, []);

  useEffect(() => {
    Animated.timing(translateY, {
      toValue: visible ? 0 : 80,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [visible]);

  return (
    <Animated.View pointerEvents="none" style={[styles.container, { transform: [{ translateY }] }]}>
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
    bottom: 24,
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