import AsyncStorage from "@react-native-async-storage/async-storage";
import { eventsForCache } from "./punchQueueLogic";

// Employee App Phase 4 - the last copy of what Home shows, saved on the
// phone so an offline start (app killed, no signal) still shows the
// employee, the company settings, today's status and hours. Firestore on
// the phone keeps data in memory only, so without this an offline cold
// start would show nothing.
//
// Each hook shows its saved copy right away and replaces it with live data
// as soon as the server answers. Only data that came from the server is
// saved. One key per employee and kind:
//   selfView | config | recentEvents | weekEvents | homeSite
// No PIN is ever in here (the self view has none).

const PREFIX = "employeeHomeCache:v1";

function keyFor(kind, companyId, employeeId) {
  return `${PREFIX}:${kind}:${companyId}:${employeeId || "-"}`;
}

export async function readHomeCache(kind, companyId, employeeId) {
  if (!companyId) return null;
  try {
    const raw = await AsyncStorage.getItem(keyFor(kind, companyId, employeeId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeHomeCache(kind, companyId, employeeId, value) {
  if (!companyId) return;
  AsyncStorage.setItem(keyFor(kind, companyId, employeeId), JSON.stringify(value)).catch(() => {});
}

export { eventsForCache };
