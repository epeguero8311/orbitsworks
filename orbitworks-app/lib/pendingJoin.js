import Constants from "expo-constants";

// The crew code token waiting to be used for sign-up. Kept in memory only:
// never in navigation params (those can show up in Sentry breadcrumbs),
// never on disk, never logged. Cleared on use or cancel.

let pendingToken = null;
const listeners = new Set();

export function setPendingJoinToken(token) {
  pendingToken = token;
  listeners.forEach((fn) => fn(pendingToken));
}

export function getPendingJoinToken() {
  return pendingToken;
}

export function clearPendingJoinToken() {
  setPendingJoinToken(null);
}

export function subscribePendingJoin(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// { appUrl, scheme } on builds that take crew codes (OrbitsWorks Dev for
// now), null otherwise. Set in app.config.js.
export function getJoinLinks() {
  const links = Constants.expoConfig?.extra?.joinLinks;
  const valid =
    links && typeof links.appUrl === "string" && links.appUrl.startsWith("https://") && typeof links.scheme === "string" && links.scheme.length > 0;
  return valid ? links : null;
}
