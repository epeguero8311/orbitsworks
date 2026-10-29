import { useEffect, useState } from "react";
import { View, Text, Pressable, Animated, StyleSheet, useWindowDimensions } from "react-native";
import { Feather } from "@expo/vector-icons";
import { lightColors as colors, spacing, fontSizes } from "../../lib/theme";
import { pinPadMetrics, KEY_LETTERS } from "../../lib/pinPadLayout";
import Spinner from "../Spinner";

const ROWS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["", "0", "del"],
];
const SHAKE_MS = 420;

// iPhone passcode style PIN pad, shared by every PIN screen: a title, one
// dot per PIN digit, a status line (spinner or message) and a 3x4 grid of
// big round keys sized from the screen. UI only - the screen owns the PIN,
// checks it and decides what a wrong PIN means.
//
// length: digits typed so far. shakeKey: when this changes to a truthy value
// (e.g. the wrong-PIN error), the dots show full, shake and clear.
// top: optional node shown above the title (e.g. a site pill).
export default function PinPad({
  title = "Enter PIN",
  subtitle,
  top,
  length,
  pinLength = 4,
  onDigit,
  onDelete,
  disabled,
  busy,
  busyLabel,
  message,
  shakeKey,
}) {
  const { width } = useWindowDimensions();
  const [gridSpace, setGridSpace] = useState(0);
  const m = pinPadMetrics(width, gridSpace);

  const [shake] = useState(() => new Animated.Value(0));
  // Dots stay full while they shake, then clear. Set during render when the
  // key changes (not in the effect) so the full dots show on the same frame.
  const [holdFull, setHoldFull] = useState(false);
  const [lastShakeKey, setLastShakeKey] = useState(shakeKey);
  if (shakeKey !== lastShakeKey) {
    setLastShakeKey(shakeKey);
    if (shakeKey) setHoldFull(true);
  }
  useEffect(() => {
    if (!shakeKey) return undefined;
    const steps = [-14, 14, -10, 10, -5, 5, 0].map((toValue) =>
      Animated.timing(shake, { toValue, duration: SHAKE_MS / 7, useNativeDriver: true })
    );
    Animated.sequence(steps).start(() => setHoldFull(false));
    return () => shake.stopAnimation();
  }, [shakeKey, shake]);

  const filled = holdFull ? pinLength : length;

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        {top}
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        <Animated.View style={[styles.dots, { transform: [{ translateX: shake }] }]}>
          {Array.from({ length: pinLength }, (_, i) => (
            <View key={i} style={[styles.dot, i < filled && styles.dotOn]} />
          ))}
        </Animated.View>
        <View style={styles.status}>
          {busy ? (
            <View style={styles.busy}>
              <Spinner size={18} color={colors.accent} />
              {busyLabel ? <Text style={styles.busyText}>{busyLabel}</Text> : null}
            </View>
          ) : message ? (
            <Text style={styles.message} numberOfLines={2}>
              {message}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.gridSpace} onLayout={(e) => setGridSpace(Math.floor(e.nativeEvent.layout.height))}>
        <View style={[styles.grid, { rowGap: m.gapY }, disabled && styles.disabled]}>
          {ROWS.map((row, r) => (
            <View key={r} style={[styles.row, { columnGap: m.gapX }]}>
              {row.map((k, c) => (
                <Key key={c} value={k} m={m} disabled={disabled} onDigit={onDigit} onDelete={onDelete} />
              ))}
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

function Key({ value, m, disabled, onDigit, onDelete }) {
  const size = { width: m.key, height: m.key, borderRadius: m.key / 2 };
  // Darkens on touch and fades back on release, like the iPhone keys.
  const [press] = useState(() => new Animated.Value(0));
  const pressIn = () => press.setValue(1);
  const pressOut = () => Animated.timing(press, { toValue: 0, duration: 250, useNativeDriver: false }).start();

  if (value === "") return <View style={size} />;

  if (value === "del") {
    return (
      <Pressable
        style={[size, styles.center]}
        onPress={onDelete}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel="Delete"
      >
        {({ pressed }) => <Feather name="delete" size={Math.round(m.key * 0.34)} color={pressed ? colors.subtext : colors.text} />}
      </Pressable>
    );
  }

  const backgroundColor = press.interpolate({ inputRange: [0, 1], outputRange: [colors.keypad, colors.keypadPressed] });
  const letters = KEY_LETTERS[value];
  return (
    <Pressable
      onPress={() => onDigit(value)}
      onPressIn={pressIn}
      onPressOut={pressOut}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={value}
    >
      <Animated.View style={[size, styles.center, { backgroundColor }]}>
        <Text style={[styles.digit, { fontSize: m.digitSize, lineHeight: Math.round(m.digitSize * 1.15) }]}>{value}</Text>
        {letters ? <Text style={[styles.letters, { fontSize: m.letterSize }]}>{letters}</Text> : null}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignSelf: "stretch" },
  head: { alignItems: "center", paddingHorizontal: spacing.xxl, paddingTop: spacing.lg },
  title: { color: colors.text, fontSize: fontSizes.xl, fontWeight: "500", textAlign: "center" },
  subtitle: { color: colors.subtext, fontSize: fontSizes.sm, textAlign: "center", marginTop: spacing.xs },
  dots: { flexDirection: "row", marginTop: spacing.xl, columnGap: spacing.xl },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: colors.text },
  dotOn: { backgroundColor: colors.text },
  status: { minHeight: 44, marginTop: spacing.md, alignItems: "center", justifyContent: "center" },
  busy: { flexDirection: "row", alignItems: "center", columnGap: spacing.sm },
  busyText: { color: colors.subtext, fontSize: fontSizes.md },
  message: { color: colors.red, fontSize: fontSizes.md, textAlign: "center" },
  gridSpace: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: spacing.md },
  grid: { alignItems: "center" },
  row: { flexDirection: "row" },
  disabled: { opacity: 0.35 },
  center: { alignItems: "center", justifyContent: "center" },
  digit: { color: colors.text, fontWeight: "300" },
  letters: { color: colors.text, fontWeight: "600", letterSpacing: 2, marginTop: -2 },
});
