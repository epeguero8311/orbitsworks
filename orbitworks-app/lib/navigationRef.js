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

// Employee App Phase 7: a tapped employee push (or break reminder) opens
// the employee's own Alerts tab.
export function navigateToEmployeeAlerts() {
  if (!navigationRef.isReady()) return;
  try {
    navigationRef.navigate("EmployeeTabs", { screen: "EmployeeAlerts" });
  } catch (e) {
    console.log("navigateToEmployeeAlerts failed:", e.message);
  }
}
