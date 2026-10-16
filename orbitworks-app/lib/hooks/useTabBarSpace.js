import { useSafeAreaInsets } from "react-native-safe-area-context";

// Single shared source for the floating tab bar's footprint - both
// FloatingTabBar (components/FloatingTabBar.js) and every scrollable tab
// screen (plus OfflineBanner, which floats just above the bar) key off
// these same numbers, so the bar's size can only ever change in one
// place.
export const TAB_BAR_HEIGHT = 56;
export const TAB_BAR_BOTTOM_MARGIN = 20;
export const TAB_BAR_SIDE_MARGIN = 20;

// The bar floats over content (position: absolute, lifted off the
// bottom with side margins) rather than reserving its own row in the
// navigator's layout, so every scrollable tab screen needs this much
// extra bottom padding or its last bit of content ends up hidden behind
// the bar.
export function useTabBarSpace() {
  const insets = useSafeAreaInsets();
  return TAB_BAR_HEIGHT + TAB_BAR_BOTTOM_MARGIN + insets.bottom;
}
