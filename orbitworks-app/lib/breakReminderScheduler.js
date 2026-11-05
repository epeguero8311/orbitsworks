import AsyncStorage from "@react-native-async-storage/async-storage";
import { ensureAndroidChannel, ensureNotificationHandler, loadNotifications, NOTIFICATION_CHANNEL_ID } from "./notificationsModule";
import { REMINDER_IDS, addScheduled, dropUnfired, firedReminders } from "./breakReminders";

// Employee App Phase 7 - puts the break reminder plan (lib/breakReminders.js)
// on the phone as local notifications. They need no signal, so they work
// offline. Fixed ids: scheduling always cancels the old ones first, so a
// break never has two sets. Nothing here is awaited by a break - Home calls
// it after the break is saved (useBreakReminders) - and nothing throws.
//
// The log of scheduled reminders (for the Alerts tab) is kept per company +
// employee, so on a shared phone each employee only sees their own.

const LOG_PREFIX = "breakReminderLog:v1";

function logKey(companyId, employeeId) {
  return `${LOG_PREFIX}:${companyId}:${employeeId}`;
}

export async function readReminderLog(companyId, employeeId) {
  if (!companyId || !employeeId) return [];
  try {
    const raw = await AsyncStorage.getItem(logKey(companyId, employeeId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function writeReminderLog(companyId, employeeId, log) {
  if (!companyId || !employeeId) return;
  try {
    await AsyncStorage.setItem(logKey(companyId, employeeId), JSON.stringify(log));
  } catch {
    // the log is only for the Alerts tab - never worth failing over
  }
}

// The reminders already due, newest first (Alerts tab).
export async function readFiredReminders(companyId, employeeId, nowMs) {
  return firedReminders(await readReminderLog(companyId, employeeId), nowMs);
}

async function cancelScheduled(Notifications) {
  await Promise.all(REMINDER_IDS.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})));
}

// Cancels every break reminder on the phone (sign-out, break ended). The
// log keeps only the ones that already fired.
export async function cancelBreakReminders(companyId, employeeId) {
  try {
    const Notifications = loadNotifications();
    if (Notifications) await cancelScheduled(Notifications);
    if (companyId && employeeId) {
      const log = await readReminderLog(companyId, employeeId);
      await writeReminderLog(companyId, employeeId, dropUnfired(log, Date.now()));
    }
  } catch (e) {
    console.log("[breakReminders] cancel failed:", e.message);
  }
}

// plan = breakReminderPlan(...) for the current break, or [] when not on a
// break. Replaces whatever was scheduled before. Calls run one after the
// other (Home can go "loading" -> "on break" in one second), so a cancel
// never lands after a newer schedule.
let queue = Promise.resolve();

export function syncBreakReminders(args) {
  queue = queue.then(() => syncNow(args)).catch(() => {});
  return queue;
}

// Sign-out: cancel everything, in the same order as any pending sync.
export function cancelAllBreakReminders(companyId, employeeId) {
  return syncBreakReminders({ companyId, employeeId, plan: [], breakStartMs: null });
}

async function syncNow({ companyId, employeeId, plan, breakStartMs }) {
  await cancelBreakReminders(companyId, employeeId);
  if (!plan || plan.length === 0) return;
  try {
    const Notifications = loadNotifications();
    if (!Notifications) return;
    const { status } = await Notifications.getPermissionsAsync();
    // No permission: nothing would show, so nothing is logged either.
    if (status !== "granted") return;
    ensureNotificationHandler(Notifications);
    await ensureAndroidChannel(Notifications);
    const scheduled = [];
    for (const r of plan) {
      try {
        await Notifications.scheduleNotificationAsync({
          identifier: r.id,
          content: { title: r.title, body: r.body, sound: true, data: { breakReminder: r.kind } },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: new Date(r.atMs),
            channelId: NOTIFICATION_CHANNEL_ID,
          },
        });
        scheduled.push(r);
      } catch (e) {
        console.log("[breakReminders] schedule failed:", e.message);
      }
    }
    const log = await readReminderLog(companyId, employeeId);
    await writeReminderLog(companyId, employeeId, addScheduled(log, scheduled, breakStartMs));
  } catch (e) {
    console.log("[breakReminders] sync failed:", e.message);
  }
}
