import * as Crypto from "expo-crypto";
import AsyncStorage from "@react-native-async-storage/async-storage";

const DEVICE_ID_KEY = "orbitworks_device_id";
const DEVICE_NAME_CACHE_KEY = "orbitworks_device_name_cache";

let cachedDeviceId = null;

// Generates a UUID v4 once per install and persists it locally - this
// becomes the doc ID under companies/{companyId}/devices, matching
// functions/src/clockEvents.ts's DEVICE_ID_REGEX on the backend. Never
// regenerated once created; reinstalling the app (or clearing storage)
// is treated as a new, unnamed device, same as it would look on a
// factory-reset device.
export async function getOrCreateDeviceId() {
  if (cachedDeviceId) return cachedDeviceId;
  try {
    const stored = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (stored) {
      cachedDeviceId = stored;
      return stored;
    }
    const fresh = Crypto.randomUUID();
    await AsyncStorage.setItem(DEVICE_ID_KEY, fresh);
    cachedDeviceId = fresh;
    return fresh;
  } catch (err) {
    console.log("Failed to get/create device id:", err);
    return null;
  }
}

// Local mirror of this device's own doc name, kept in sync by
// useDeviceDoc.js whenever its onSnapshot fires. Clock-ins read this
// instead of hitting Firestore, so capturing deviceNameSnapshot at
// clock-in time is always a local, offline-safe read - never a network
// call that could delay or block clocking in. Stale if the device was
// renamed elsewhere (web admin, or another install) and this app hasn't
// reconnected since - acceptable given the fail-safe requirement that
// device naming never affects the clock-in path itself.
export async function getCachedDeviceName() {
  try {
    return await AsyncStorage.getItem(DEVICE_NAME_CACHE_KEY);
  } catch (err) {
    console.log("Failed to read cached device name:", err);
    return null;
  }
}

export async function setCachedDeviceName(name) {
  try {
    if (name) {
      await AsyncStorage.setItem(DEVICE_NAME_CACHE_KEY, name);
    } else {
      await AsyncStorage.removeItem(DEVICE_NAME_CACHE_KEY);
    }
  } catch (err) {
    console.log("Failed to cache device name:", err);
  }
}
