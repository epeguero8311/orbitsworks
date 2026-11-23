import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";
import { ensureAndroidChannel, ensureNotificationHandler, loadNotifications } from "./notificationsModule";

// Employee App Phase 7 - this phone's Expo push token for the signed-in
// employee. Saved by the server only (registerEmployeePushToken ->
// companies/{c}/employeePushTokens/{employeeId}, which no client can read),
// never the supervisor company pushTokens doc. Nothing here ever throws or
// blocks a punch, a break or sign-out.

const registerFn = httpsCallable(functions, "registerEmployeePushToken", { timeout: 15000 });
const clearFn = httpsCallable(functions, "clearEmployeePushToken", { timeout: 3000 });

// "<employeeId>:<token>" last saved on the server in this app run, so a
// foreground check doesn't call the server again for the same token.
let registeredKey = null;
// The token this phone last saved, for sign-out.
let lastToken = null;

async function currentToken(Notifications) {
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const res = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  return res?.data || null;
}

// Saves this phone's token for employeeId when notifications are allowed.
// knownToken: from the token-change listener (skips asking Expo again).
// -> the token, or null (not allowed, simulator, Expo Go, offline, ...).
export async function registerEmployeePush(employeeId, knownToken = null) {
  try {
    if (!employeeId || !Device.isDevice) return null;
    const Notifications = loadNotifications();
    if (!Notifications) return null;
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") return null;
    ensureNotificationHandler(Notifications);
    await ensureAndroidChannel(Notifications);
    const token = knownToken || (await currentToken(Notifications));
    if (!token) return null;
    lastToken = token;
    const key = `${employeeId}:${token}`;
    if (registeredKey === key) return token;
    await registerFn({ token, platform: Platform.OS === "ios" ? "ios" : "android" });
    registeredKey = key;
    return token;
  } catch (e) {
    console.log("[employeePush] register failed:", e.message);
    return null;
  }
}

// Sign-out: the server removes the token only if it is still this phone's.
// The callable times out at 3 s; the sign-out never waits longer.
export async function clearEmployeePush() {
  try {
    registeredKey = null;
    const Notifications = loadNotifications();
    let token = lastToken;
    if (!token && Notifications) {
      const { status } = await Notifications.getPermissionsAsync();
      if (status === "granted") token = await currentToken(Notifications);
    }
    lastToken = null;
    if (!token) return false;
    await clearFn({ token });
    return true;
  } catch (e) {
    console.log("[employeePush] clear failed:", e.message);
    return false;
  }
}
