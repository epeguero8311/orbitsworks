// Can this build ask for "Always" (background) location? Pure rule, no React
// Native imports, so plain Node tests can run it (test/backgroundLocation.test.js).
//
// flags = Constants.expoConfig.extra.backgroundLocation, written by
// app.config.js from the expo-location plugin options: { ios, android }.
// Android is false in 1.1.6: no ACCESS_BACKGROUND_LOCATION in the manifest
// until the Play background location declaration is done. Without the
// native permission the "Always" prompt can't work, so the app must never
// show the Always screen, the walk-through, or arm a geofence region there.
// Missing flags (an older build's config) = iPhone yes, Android no.
export function alwaysLocationAvailable(platform, flags) {
  if (platform === "ios") return !flags || flags.ios !== false;
  if (platform === "android") return !!flags && flags.android === true;
  return false;
}
