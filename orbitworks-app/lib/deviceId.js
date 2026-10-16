import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";

const DEVICE_ID_KEY = "orbitworks_device_id";
// Pre-company-scoping cache key (one global name for the whole install,
// no matter which company was logged in when it was set) - see
// migrateLegacyDeviceName below for the one-time upgrade off of it.
const LEGACY_DEVICE_NAME_CACHE_KEY = "orbitworks_device_name_cache";
const DEVICE_NAME_KEY_PREFIX = "orbitworks.deviceName.";

let cachedDeviceId = null;

// SecureStore keys may only contain alphanumerics plus . - _ . Firestore
// auto-generated company IDs are already alphanumeric, but this is a
// defensive sanitize in case that ever changes.
function secureStoreKeyForCompany(companyId) {
  const sanitized = String(companyId).replace(/[^A-Za-z0-9._-]/g, "_");
  return `${DEVICE_NAME_KEY_PREFIX}${sanitized}`;
}

// One-time upgrade for installs that cached a device name before it was
// scoped per company - that old cache was a single global AsyncStorage
// key, which bled the same name across every company a shared/reused
// device logged into. The legacy key's own presence is the guard: once
// migrated (or found empty) it is deleted, so this is a no-op on every
// call after the first. Never overwrites a name this company already
// has in SecureStore - only fills in a blank.
export async function migrateLegacyDeviceName(companyId) {
  try {
    const legacyName = await AsyncStorage.getItem(LEGACY_DEVICE_NAME_CACHE_KEY);
    if (legacyName) {
      const key = secureStoreKeyForCompany(companyId);
      const existing = await SecureStore.getItemAsync(key);
      if (!existing) {
        await SecureStore.setItemAsync(key, legacyName);
      }
    }
    await AsyncStorage.removeItem(LEGACY_DEVICE_NAME_CACHE_KEY);
  } catch (err) {
    console.log("Failed to migrate legacy device name cache:", err);
  }
}

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

// Local mirror of this device's own doc name for the GIVEN company, kept
// in sync by useDeviceDoc.js whenever its onSnapshot fires. Clock-ins
// read this instead of hitting Firestore, so capturing deviceNameSnapshot
// at clock-in time is always a local, offline-safe read - never a
// network call that could delay or block clocking in. Stale if the
// device was renamed elsewhere (web admin, or another install) and this
// app hasn't reconnected since - acceptable given the fail-safe
// requirement that device naming never affects the clock-in path itself.
// Scoped by companyId (not uid) in SecureStore, so switching which
// company is logged in on this device - supervisor A to B at the same
// company, or company A to company B - never bleeds one company's name
// into another's; each company keeps its own name across logout/login.
export async function getCachedDeviceName(companyId) {
  if (!companyId) return null;
  try {
    await migrateLegacyDeviceName(companyId);
    return await SecureStore.getItemAsync(secureStoreKeyForCompany(companyId));
  } catch (err) {
    console.log("Failed to read cached device name:", err);
    return null;
  }
}

export async function setCachedDeviceName(companyId, name) {
  if (!companyId) return;
  try {
    const key = secureStoreKeyForCompany(companyId);
    if (name) {
      await SecureStore.setItemAsync(key, name);
    } else {
      await SecureStore.deleteItemAsync(key);
    }
  } catch (err) {
    console.log("Failed to cache device name:", err);
  }
}
