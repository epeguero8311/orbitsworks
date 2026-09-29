export const DEVICE_NAME_MIN_LENGTH = 1;
export const DEVICE_NAME_MAX_LENGTH = 24;

// Mirrors lib/validators/device.ts's deviceNameSchema on orbitworks-web -
// keep both in sync by hand (no shared package across the app/web
// boundary, same convention as OverrideReasonScreen.js/GeofenceReasonScreen.js's
// MIN_LENGTH/MAX_LENGTH constants).
export function validateDeviceName(name) {
  const trimmed = (name ?? "").trim();
  if (trimmed.length < DEVICE_NAME_MIN_LENGTH) {
    return { valid: false, trimmed, error: "Device name is required" };
  }
  if (trimmed.length > DEVICE_NAME_MAX_LENGTH) {
    return {
      valid: false,
      trimmed,
      error: `Device name must be ${DEVICE_NAME_MAX_LENGTH} characters or fewer`,
    };
  }
  return { valid: true, trimmed, error: null };
}
