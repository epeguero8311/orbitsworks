import { Expo, type ExpoPushMessage } from "expo-server-sdk";
import { db } from "./shared";
import { PUSH_NOTIFICATIONS_ENABLED } from "./flags";
import type { AlertDoc } from "./alerts";

const expo = new Expo();

const ALERT_TITLE: Record<AlertDoc["alertType"], string> = {
  lateClockIn: "Late Clock-In",
  earlyClockOut: "Early Clock-Out",
  breakTooLong: "Long Break",
  maxHours: "Max Hours",
  overtime: "Overtime",
  missedClockOut: "Missed Clock-Out",
  clockedInOutsideGeofence: "Outside Geofence",
  siteMismatch: "Wrong Site",
  faceMismatch: "Face Mismatch",
  faceNoFace: "No Face Detected",
  faceBadReference: "Bad Reference Photo",
  employeeUpdated: "Employee Updated",
  // Never actually sent - functions/src/autoClockOut.ts writes this alert
  // via createAlertIfNew directly, never through sendPushForAlert. Present
  // only so this Record stays exhaustive over AlertDoc["alertType"].
  autoClockOut: "Auto Clocked Out",
  // Never sent either - written via createAlertIfNew directly (see
  // functions/src/employeeClockQueued.ts and clockEvents.ts).
  syncWrongPin: "Wrong PIN at Sync",
  syncedLateApproved: "Late Punch on Approved Timesheet",
  // Never sent either - written via createAlertIfNew (createPinChangedAlert).
  pinChanged: "PIN Changed",
  // Never sent either - written via createAlertIfNew (createLeftJobSiteAlert).
  leftJobSite: "Left Job Site",
};

// Sends one alert to every registered, notification-enabled device on the
// company - not filtered by role/site the way the Alerts tab itself is.
// This app's shared-login/PIN model has no fixed "this device belongs to
// supervisor X" association (any device can clock in any employee via
// PIN), so there's no reliable narrower audience to target; the open
// decision this follows ("shared-login companies: push goes to every
// device on that login") is really the only option here, not just the
// simplest one. Tapping the push opens the Alerts tab, which DOES apply
// the same site/role filtering the in-app list uses.
export async function sendPushForAlert(alert: AlertDoc): Promise<void> {
  if (!PUSH_NOTIFICATIONS_ENABLED.value()) return;

  const tokensSnap = await db
    .collection("companies")
    .doc(alert.companyId)
    .collection("pushTokens")
    .where("notificationsEnabled", "==", true)
    .get();

  if (tokensSnap.empty) return;

  const messages: ExpoPushMessage[] = [];
  const tokenToDocId = new Map<string, string>();

  for (const doc of tokensSnap.docs) {
    const token = doc.data().token;
    if (typeof token !== "string" || !Expo.isExpoPushToken(token)) {
      console.warn("Skipping malformed push token", { companyId: alert.companyId, deviceId: doc.id });
      continue;
    }
    tokenToDocId.set(token, doc.id);
    messages.push({
      to: token,
      title: ALERT_TITLE[alert.alertType] ?? "Alert",
      body: alert.message,
      data: { alertId: alert.id, alertType: alert.alertType },
    });
  }

  if (messages.length === 0) return;

  const staleTokens = await sendExpoMessages(messages, { companyId: alert.companyId });
  const staleDeviceIds: string[] = [];
  for (const token of staleTokens) {
    const deviceId = tokenToDocId.get(token);
    if (deviceId) staleDeviceIds.push(deviceId);
  }

  for (const deviceId of staleDeviceIds) {
    await db
      .collection("companies")
      .doc(alert.companyId)
      .collection("pushTokens")
      .doc(deviceId)
      .delete()
      .catch((err) => {
        console.warn("Failed to remove stale push token", { companyId: alert.companyId, deviceId, error: String(err) });
      });
  }
}

// The Expo send loop shared by supervisor alert pushes (above) and Employee
// App Phase 7 employee pushes (employeeAlerts.ts). Chunks the messages,
// sends each chunk on its own (a failed chunk is logged, never thrown), logs
// every error ticket, and returns the tokens Expo says are no longer
// registered, so each caller deletes them from its own collection.
export async function sendExpoMessages(messages: ExpoPushMessage[], logContext: Record<string, unknown>): Promise<string[]> {
  const staleTokens: string[] = [];
  for (const chunk of expo.chunkPushNotifications(messages)) {
    try {
      const tickets = await expo.sendPushNotificationsAsync(chunk);
      tickets.forEach((ticket, i) => {
        if (ticket.status !== "error") return;
        console.warn("Push ticket error", { ...logContext, error: ticket.message });
        if (ticket.details?.error === "DeviceNotRegistered") staleTokens.push(chunk[i].to as string);
      });
    } catch (err) {
      console.warn("Push chunk send failed", { ...logContext, error: String(err) });
    }
  }
  return staleTokens;
}
