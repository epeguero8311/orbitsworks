import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";

const DEVICE_ID_KEY = "orbitworks_device_id";

let cached = null;

// A fresh per-install identifier, independent of the pro-plan Device
// Recognition feature (which doesn't exist on main) - this only exists to
// give a push token doc a stable key. Generated once and persisted in
// SecureStore, which survives app updates but not a reinstall/uninstall -
// that's fine, a reinstall is a new install as far as push registration
// is concerned.
export async function getOrCreateDeviceId() {
  if (cached) return cached;
  try {
    let id = await SecureStore.getItemAsync(DEVICE_ID_KEY);
    if (!id) {
      id = Crypto.randomUUID();
      await SecureStore.setItemAsync(DEVICE_ID_KEY, id);
    }
    cached = id;
    return id;
  } catch (e) {
    // SecureStore unavailable is not fatal - callers treat a null id as
    // "skip push registration," never as a reason to break anything else.
    console.log("getOrCreateDeviceId failed:", e.message);
    return null;
  }
}
