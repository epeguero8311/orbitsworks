import AsyncStorage from "@react-native-async-storage/async-storage";
import { readHomeCache } from "./employeeHomeCache";
import { getAlwaysLocationStatus } from "./locationPermission";
import { isLocationConsentAccepted } from "./siteTracking";

// Employee App Phase 8 (D19): ask for the location consent + "Always"
// location just in time - once per employee on this phone, after the
// green screen of a clock-in on a Pro company at a geofenced job site
// (never in front of a punch). Afterwards the Home banner and Settings are
// the way back. Never throws.
const ASKED_PREFIX = "alwaysLocationAsked:v1:";

export async function shouldAskAlways(companyId, employeeId) {
  try {
    if (!companyId || !employeeId) return false;
    if (await AsyncStorage.getItem(`${ASKED_PREFIX}${companyId}:${employeeId}`)) return false;
    const [config, homeSite] = await Promise.all([readHomeCache("config", companyId, null), readHomeCache("homeSite", companyId, employeeId)]);
    if (!config || config.isPro !== true) return false;
    if (!homeSite || !homeSite.fence) return false;
    const [consent, access] = await Promise.all([isLocationConsentAccepted(companyId, employeeId), getAlwaysLocationStatus()]);
    return !(consent && access === "always");
  } catch {
    return false;
  }
}

export async function markAlwaysAsked(companyId, employeeId) {
  try {
    await AsyncStorage.setItem(`${ASKED_PREFIX}${companyId}:${employeeId}`, "1");
  } catch {
    // Asked again next time - harmless.
  }
}
