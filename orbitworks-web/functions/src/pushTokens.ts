import type { Timestamp } from "firebase-admin/firestore";

// Expo push tokens are shaped like "ExponentPushToken[xxxxxxxxxxxxxxxxxxxx]"
// (or the legacy "ExpoPushToken[...]" form). The mobile app writes its own
// pushTokens doc directly (firestore.rules enforces this same pattern at
// write time, plus own-company/own-device-id) rather than through a
// callable - there's no privileged operation here rules can't already
// express. sendPushForAlert (pushSend.ts) independently re-checks the
// format with Expo.isExpoPushToken before ever sending, as a second line
// of defense against a stored value that's stale or was never valid.
export const EXPO_PUSH_TOKEN_PATTERN = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$/;

// companies/{companyId}/pushTokens/{deviceId} - one per mobile install.
// deviceId is a fresh per-install identifier the app generates for itself
// (expo-secure-store) - not the pro-plan Device Recognition feature,
// which doesn't exist on main. Server-read only (the push-sending
// function); notificationsEnabled is the per-device Settings toggle, so
// disabling notifications never has to delete this doc - a stale-token
// cleanup always has one to find and remove.
export interface PushTokenDoc {
  deviceId: string;
  token: string;
  platform: "ios" | "android";
  notificationsEnabled: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
