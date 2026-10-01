import { Platform, Alert } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";
import { getOrCreatePushDeviceId } from "./pushDeviceId";

// Foreground display behavior - show + sound while the app is open, no
// badge (nothing on this app's icon reads a badge count today).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Shows the "why we're asking" explanation only when the system
// permission is still undetermined (i.e. genuinely first launch after
// this shipped, or first launch ever for a new install) - never nags an
// already-granted or already-denied user again. Denying changes nothing
// else in the app; this just resolves false and the caller skips
// registration.
async function ensureNotificationPermission() {
  const { status, canAskAgain } = await Notifications.getPermissionsAsync();
  if (status === "granted") return true;
  if (status !== "undetermined" || !canAskAgain) return false;

  return new Promise((resolve) => {
    Alert.alert(
      "Stay on top of alerts",
      "OrbitsWorks can notify you about late clock-ins, missed clock-outs, and other issues that need attention - even when the app is closed.",
      [
        { text: "Not Now", style: "cancel", onPress: () => resolve(false) },
        {
          text: "Enable",
          onPress: async () => {
            const { status: newStatus } = await Notifications.requestPermissionsAsync();
            resolve(newStatus === "granted");
          },
        },
      ]
    );
  });
}

// Registers (or refreshes) this device's push token. Safe to call on
// every launch - a no-op on a simulator, a no-op if permission was
// already denied, and a merge write that preserves an existing
// notificationsEnabled preference rather than resetting it. Never throws:
// notification setup failing must never affect the rest of the app.
export async function registerForPushNotificationsAsync(companyId) {
  try {
    if (!Device.isDevice) return;
    if (!companyId) return;

    const granted = await ensureNotificationPermission();
    if (!granted) return;

    const deviceId = await getOrCreatePushDeviceId();
    if (!deviceId) return;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const tokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    const token = tokenResponse?.data;
    if (!token) return;

    const ref = doc(db, "companies", companyId, "pushTokens", deviceId);
    const existing = await getDoc(ref);

    await setDoc(
      ref,
      {
        deviceId,
        token,
        platform: Platform.OS,
        notificationsEnabled: existing.exists() ? existing.data().notificationsEnabled ?? true : true,
        updatedAt: serverTimestamp(),
        ...(existing.exists() ? {} : { createdAt: serverTimestamp() }),
      },
      { merge: true }
    );
  } catch (e) {
    console.log("registerForPushNotificationsAsync failed:", e.message);
  }
}

// Settings screen toggle - flips the per-device preference without
// touching the token itself. Returns false on failure so the UI can
// revert the switch instead of showing a state that didn't actually save.
export async function setNotificationsEnabled(companyId, enabled) {
  try {
    const deviceId = await getOrCreatePushDeviceId();
    if (!companyId || !deviceId) return false;
    const ref = doc(db, "companies", companyId, "pushTokens", deviceId);
    const existing = await getDoc(ref);
    if (!existing.exists()) return false;
    await setDoc(ref, { notificationsEnabled: enabled, updatedAt: serverTimestamp() }, { merge: true });
    return true;
  } catch (e) {
    console.log("setNotificationsEnabled failed:", e.message);
    return false;
  }
}

// Reads this device's current registration/preference - null when never
// registered (e.g. permission was denied, or this ran on a simulator).
export async function getNotificationState(companyId) {
  try {
    const deviceId = await getOrCreatePushDeviceId();
    if (!companyId || !deviceId) return null;
    const snap = await getDoc(doc(db, "companies", companyId, "pushTokens", deviceId));
    if (!snap.exists()) return null;
    return { notificationsEnabled: snap.data().notificationsEnabled ?? true };
  } catch (e) {
    console.log("getNotificationState failed:", e.message);
    return null;
  }
}
