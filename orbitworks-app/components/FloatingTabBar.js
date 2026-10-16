import { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Animated } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../lib/ThemeContext";
import { TAB_BAR_HEIGHT, TAB_BAR_BOTTOM_MARGIN, TAB_BAR_SIDE_MARGIN } from "../lib/hooks/useTabBarSpace";

const TAB_ICONS = {
  Home: "home",
  Alerts: "bell",
  SyncQueue: "refresh-cw",
  Settings: "settings",
};

const PILL_SIZE = TAB_BAR_HEIGHT - 12;

// Bar background stays dark/translucent in both themes (never follows
// the light background color), but the exact shade flips so there's
// always contrast against whatever is behind it: a dark grey (not
// black) on a light screen, and a lighter grey than the dark screen's
// own background/card colors (ThemeContext.js's #0b0b0f/#18181b) when
// the app itself is in dark mode.
const BAR_BACKGROUND_LIGHT = "rgba(75,75,82,0.92)";
const BAR_BACKGROUND_DARK = "rgba(46,46,51,0.92)";

// Floating pill nav bar - same tabs/order/routes/behavior as the default
// bottom tab bar it replaces, only the look changes. The active pill and
// icon tints pull from useTheme() so they stay in sync with the rest of
// the app's accent color.
export default function FloatingTabBar({ state, descriptors, navigation }) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [barWidth, setBarWidth] = useState(0);
  const slideAnim = useRef(new Animated.Value(state.index)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: state.index,
      useNativeDriver: true,
      friction: 9,
      tension: 80,
    }).start();
  }, [state.index, slideAnim]);

  const tabCount = state.routes.length;
  const tabWidth = tabCount > 0 ? barWidth / tabCount : 0;

  const translateX = slideAnim.interpolate({
    inputRange: state.routes.map((_, i) => i),
    outputRange: state.routes.map((_, i) => i * tabWidth + (tabWidth - PILL_SIZE) / 2),
  });

  return (
    <View
      style={[
        styles.container,
        { bottom: TAB_BAR_BOTTOM_MARGIN + insets.bottom, backgroundColor: isDark ? BAR_BACKGROUND_DARK : BAR_BACKGROUND_LIGHT },
      ]}
      onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
    >
      {barWidth > 0 && (
        <Animated.View
          style={[
            styles.activePill,
            { backgroundColor: colors.accent, transform: [{ translateX }] },
          ]}
        />
      )}
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const focused = state.index === index;
        const badge = options.tabBarBadge;

        const onPress = () => {
          const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        return (
          <TouchableOpacity
            key={route.key}
            onPress={onPress}
            style={styles.tab}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityState={focused ? { selected: true } : {}}
            accessibilityLabel={options.tabBarLabel ?? route.name}
          >
            <View>
              <Feather
                name={TAB_ICONS[route.name]}
                size={22}
                color={focused ? "#ffffff" : "rgba(255,255,255,0.55)"}
              />
              {badge != null && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{badge > 9 ? "9+" : badge}</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: TAB_BAR_SIDE_MARGIN,
    right: TAB_BAR_SIDE_MARGIN,
    height: TAB_BAR_HEIGHT,
    borderRadius: TAB_BAR_HEIGHT / 2,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  activePill: {
    position: "absolute",
    top: (TAB_BAR_HEIGHT - PILL_SIZE) / 2,
    width: PILL_SIZE,
    height: PILL_SIZE,
    borderRadius: PILL_SIZE / 2,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#ef4444",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: { color: "#fff", fontSize: 10, fontWeight: "700" },
});
