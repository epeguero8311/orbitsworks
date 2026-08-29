import { useEffect, useRef, useState } from "react";
import { View, Animated, StyleSheet, Easing } from "react-native";

const MIN_DISPLAY_MS = 2000;
const FADE_IN_MS = 400;
const FADE_OUT_MS = 300;

// Mirrors the web login page's orbit animation (app/login/page.tsx):
// three concentric rings, each carrying one dot, alternating spin
// direction, no logo at the center - just a plain dot. The web version
// spins at 70s/50s/40s per rotation (near-static ambient drift); those
// exact durations would show no visible motion in a ~2s splash, so
// these are scaled down while keeping the same ratio and alternating
// direction pattern, so it reads as "slow orbit" rather than a fast
// spin - closer in feel to the site, not a literal 1:1 duration match.
export default function LoadingScreen({ ready, onFinish }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const outerRotate = useRef(new Animated.Value(0)).current;
  const middleRotate = useRef(new Animated.Value(0)).current;
  const innerRotate = useRef(new Animated.Value(0)).current;
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);
  const finishedRef = useRef(false);

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: FADE_IN_MS,
      useNativeDriver: true,
    }).start();

    Animated.loop(
      Animated.timing(outerRotate, {
        toValue: 1,
        duration: 9000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();

    Animated.loop(
      Animated.timing(middleRotate, {
        toValue: 1,
        duration: 6500,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();

    Animated.loop(
      Animated.timing(innerRotate, {
        toValue: 1,
        duration: 5000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();

    const timer = setTimeout(() => setMinTimeElapsed(true), MIN_DISPLAY_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (finishedRef.current) return;
    if (ready && minTimeElapsed) {
      finishedRef.current = true;
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: FADE_OUT_MS,
        useNativeDriver: true,
      }).start(() => onFinish && onFinish());
    }
  }, [ready, minTimeElapsed]);

  const spin = (val, reverse) =>
    val.interpolate({
      inputRange: [0, 1],
      outputRange: reverse ? ["360deg", "0deg"] : ["0deg", "360deg"],
    });

  return (
    <View style={styles.container}>
      <Animated.View style={{ opacity: fadeAnim, alignItems: "center", justifyContent: "center" }}>
        <View style={styles.orbitWrap}>
          <Animated.View style={[styles.ring, styles.ringOuter, { transform: [{ rotate: spin(outerRotate, false) }] }]}>
            <View style={[styles.dot, styles.dotOuter]} />
          </Animated.View>

          <Animated.View style={[styles.ring, styles.ringMiddle, { transform: [{ rotate: spin(middleRotate, true) }] }]}>
            <View style={[styles.dot, styles.dotMiddle]} />
          </Animated.View>

          <Animated.View style={[styles.ring, styles.ringInner, { transform: [{ rotate: spin(innerRotate, false) }] }]}>
            <View style={[styles.dot, styles.dotInner]} />
          </Animated.View>

          <View style={styles.centerDot} />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#3b6fe0",
  },
  orbitWrap: {
    width: 180,
    height: 180,
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    position: "absolute",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    borderRadius: 999,
  },
  ringOuter: { width: 180, height: 180 },
  ringMiddle: { width: 128, height: 128 },
  ringInner: { width: 76, height: 76 },
  dot: {
    position: "absolute",
    borderRadius: 999,
    backgroundColor: "#ffffff",
  },
  dotOuter: { width: 12, height: 12, top: -6, left: "50%", marginLeft: -6 },
  dotMiddle: { width: 10, height: 10, top: "50%", right: -5, marginTop: -5 },
  dotInner: { width: 8, height: 8, bottom: -4, left: "50%", marginLeft: -4 },
  centerDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#ffffff",
  },
});