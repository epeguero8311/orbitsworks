import { useWindowDimensions } from "react-native";
import { layoutFor } from "../tabletLayout";

// Task 7: { width, height, landscape, grid } for the current window -
// re-renders on rotation and Split View resizes (lib/tabletLayout.js).
export function useTabletLayout() {
  const { width, height } = useWindowDimensions();
  return { width, height, ...layoutFor(width, height) };
}
