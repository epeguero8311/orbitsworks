import * as admin from "firebase-admin";
import { resend } from "./resend";

// One send path for every invite email (supervisor/admin invites/{id} and
// Employee App employeeInvites/{token}): send through Resend, then record
// the outcome on the invite doc so the Employees page can show it.
// Callers bind RESEND_API_KEY in their function's secrets.

export const INVITE_FROM = "OrbitsWorks <noreply@send.orbitsworks.com>";
export const INVITE_REPLY_TO = "epeguero8311@gmail.com";

export interface InviteEmailMessage {
  to: string;
  subject: string;
  html: string;
}

// Records a failure without sending (no link for this project, rate limit).
export async function recordInviteEmailFailure(ref: admin.firestore.DocumentReference, message: string): Promise<void> {
  await ref.update({
    emailStatus: "failed",
    emailError: message,
    lastEmailAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

// Never throws for a send failure - it is written to the doc instead.
// Returns true when Resend accepted the email.
export async function sendInviteEmailAndRecord(ref: admin.firestore.DocumentReference, msg: InviteEmailMessage): Promise<boolean> {
  try {
    const { error } = await resend.emails.send({
      from: INVITE_FROM,
      replyTo: INVITE_REPLY_TO,
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
    });
    if (error) {
      await recordInviteEmailFailure(ref, error.message);
      return false;
    }
    await ref.update({
      emailStatus: "sent",
      emailSentAt: admin.firestore.FieldValue.serverTimestamp(),
      lastEmailAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
      emailError: null,
    });
    return true;
  } catch (err) {
    await recordInviteEmailFailure(ref, err instanceof Error ? err.message : String(err));
    return false;
  }
}
