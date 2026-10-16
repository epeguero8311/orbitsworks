import { useEffect, useRef } from "react";
import { Animated, Easing } from "react-native";
import Svg, { Circle } from "react-native-svg";

const DEFAULT_COLOR = "#3b6fe0";
const DEFAULT_TRACK_COLOR = "#e5e7eb";
const WHITE_TRACK_COLOR = "rgba(255,255,255,0.3)";

function isWhiteColor(color) {
  return color === "#fff" || color === "#ffffff" || color === "white";
}

// Shared loading indicator - replaces every ActivityIndicator in the app.
// trackColor defaults to light gray, but auto-switches to a translucent
// white when color is white (e.g. on accent-blue buttons), since a light
// gray track would barely show up on a dark/colored background. Pass
// trackColor explicitly to override either default.
export default function Spinner({ size = 40, color = DEFAULT_COLOR, trackColor }) {
  const spinValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(spinValue, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    animation.start();
    return () => animation.stop();
  }, [spinValue]);

  const rotate = spinValue.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  const resolvedTrackColor = trackColor ?? (isWhiteColor(color) ? WHITE_TRACK_COLOR : DEFAULT_TRACK_COLOR);
  const strokeWidth = Math.max(2, size * 0.1);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const arcLength = circumference / 4;
  const center = size / 2;

  return (
    <Animated.View style={{ width: size, height: size, transform: [{ rotate }] }}>
      <Svg width={size} height={size}>
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={resolvedTrackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={`${arcLength} ${circumference - arcLength}`}
          strokeLinecap="round"
          fill="none"
        />
      </Svg>
    </Animated.View>
  );
}
