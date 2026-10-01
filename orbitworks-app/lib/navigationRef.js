import { createNavigationContainerRef } from "@react-navigation/native";

// Lets code outside the component tree (the notification tap handler)
// navigate without needing a `navigation` prop passed down to it.
export const navigationRef = createNavigationContainerRef();

export function navigateToAlert(alertId) {
  if (!navigationRef.isReady()) return;
  try {
    navigationRef.navigate("MainTabs", { screen: "Alerts", params: { alertId } });
  } catch (e) {
    // MainTabs isn't reachable from wherever the nav tree currently is
    // (e.g. tapped a stale notification while logged out) - never worth
    // crashing over.
    console.log("navigateToAlert failed:", e.message);
  }
}
