import Constants from "expo-constants";

// The sign-up link waiting to be used: a crew code (kind "qr") or an
// email invite (kind "invite", Phase 3B). Kept in memory only: never in
// navigation params (those can show up in Sentry breadcrumbs), never on
// disk, never logged. Cleared on use or cancel.

let pendingToken = null;
let pendingKind = "qr";
const listeners = new Set();

// kind is set before listeners run, so a listener reading
// getPendingJoinKind() always sees the kind that goes with the token.
export function setPendingJoinToken(token, kind = "qr") {
  pendingToken = token;
  pendingKind = token && kind === "invite" ? "invite" : "qr";
  listeners.forEach((fn) => fn(pendingToken));
}

export function getPendingJoinToken() {
  return pendingToken;
}

// "qr" or "invite" for the pending token ("qr" when there is none).
export function getPendingJoinKind() {
  return pendingKind;
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
