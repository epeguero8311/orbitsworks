import { getLocationPermissionStatus } from "./locationPermission";
import { startPunchFixWith } from "./punchFixLogic";

// Employee App Phase 6 - location on every punch, every plan. Started when
// the PIN screen or the break confirm opens; the save takes whatever is
// ready (lib/punchFixLogic.js). Never asks for permission here (that is
// sign-up step 3, the Home banner and Settings), never tracks: one lookup
// per punch screen. The supervisor app keeps lib/location.js.
//
// expo-location is required lazily, same reason as lib/location.js: its
// native binding can throw at import time on a binary without it.
export function startPunchFix() {
  return startPunchFixWith({
    loadLocation: () => require("expo-location"),
    getStatus: getLocationPermissionStatus,
  });
}
