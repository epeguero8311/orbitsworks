import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { db } from "./shared";
import { resend, RESEND_API_KEY } from "./lib/resend";
import { buildInviteEmail } from "./emailTemplates/inviteEmail";
import { checkInviteRateLimit, canResendEmail } from "./lib/inviteRateLimit";

const APP_BASE_URL = "https://orbitsworks.com";

type InviteData = {
  email?: string;
  companyId?: string;
  status?: "pending" | "accepted";
  role?: "supervisor" | "admin";
  invitedByUid?: string;
  linkExistingEmployeeId?: string;
  lastEmailAttemptAt?: admin.firestore.Timestamp | null;
};

// Looks up the company, renders the template, sends via Resend, and records
// the outcome back onto the invite. Shared by the onCreate trigger and the
// resendInviteEmail callable so both go through the exact same send path.
async function deliverInviteEmail(inviteRef: admin.firestore.DocumentReference, invite: InviteData) {
  if (!invite.email || !invite.companyId) return;

  const companySnap = await db.collection("companies").doc(invite.companyId).get();
  const companyData = companySnap.data() as { name?: string; logoUrl?: string | null } | undefined;
  const companyName = companyData?.name || "your company";
  const companyLogoUrl = companyData?.logoUrl ?? undefined;

  const joinLink = `${APP_BASE_URL}/join?email=${encodeURIComponent(invite.email)}`;

  const { subject, html } = buildInviteEmail({
    companyName,
    role: invite.role ?? "supervisor",
    joinLink,
    companyLogoUrl,
  });

  try {
    const { error } = await resend.emails.send({
      from: "OrbitsWorks <noreply@send.orbitsworks.com>",
      replyTo: "epeguero8311@gmail.com",
      to: invite.email,
      subject,
      html,
    });

    if (error) {
      await inviteRef.update({
        emailStatus: "failed",
        emailError: error.message,
        lastEmailAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return;
    }

    await inviteRef.update({
      emailStatus: "sent",
      emailSentAt: admin.firestore.FieldValue.serverTimestamp(),
      lastEmailAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
      emailError: null,
    });
  } catch (err) {
    await inviteRef.update({
      emailStatus: "failed",
      emailError: err instanceof Error ? err.message : String(err),
      lastEmailAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
}

// Fires once per invite doc (client creates it directly via addDoc), sends
// the supervisor their join link by email, and records the outcome back
// onto the invite so the dashboard can show whether it actually went out.
export const sendInviteEmail = onDocumentCreated(
  { document: "invites/{inviteId}", secrets: [RESEND_API_KEY] },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const invite = snap.data() as InviteData;
    if (!invite.email || !invite.companyId) return;

    // Firestore triggers can't surface errors back to the caller that
    // created the doc - if the company is over the send-rate limit, record
    // the failure on the invite itself instead of throwing from here.
    try {
      await checkInviteRateLimit(invite.companyId);
    } catch (err) {
      await snap.ref.update({
        emailStatus: "failed",
        emailError: err instanceof Error ? err.message : String(err),
        lastEmailAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return;
    }

    await deliverInviteEmail(snap.ref, invite);
  }
);

export const resendInviteEmail = onCall(
  { secrets: [RESEND_API_KEY] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }
    const callerRole = request.auth.token.role as string | undefined;
    const callerCompanyId = request.auth.token.companyId as string | undefined;
    if ((callerRole !== "admin" && callerRole !== "owner") || !callerCompanyId) {
      throw new HttpsError("permission-denied", "Not authorized.");
    }

    const inviteId = (request.data && request.data.inviteId ? String(request.data.inviteId) : "").trim();
    if (!inviteId) {
      throw new HttpsError("invalid-argument", "inviteId is required.");
    }

    const inviteRef = db.collection("invites").doc(inviteId);
    const inviteSnap = await inviteRef.get();
    if (!inviteSnap.exists) {
      throw new HttpsError("not-found", "Invite not found.");
    }

    const invite = inviteSnap.data() as InviteData;
    if (invite.companyId !== callerCompanyId) {
      throw new HttpsError("permission-denied", "Not authorized.");
    }
    if (invite.status !== "pending") {
      throw new HttpsError("failed-precondition", "This invite has already been accepted.");
    }
    if (!canResendEmail(invite.lastEmailAttemptAt)) {
      throw new HttpsError("resource-exhausted", "Please wait a bit before resending this invite.");
    }

    await deliverInviteEmail(inviteRef, invite);

    const updatedSnap = await inviteRef.get();
    const updated = updatedSnap.data() as InviteData & { emailStatus?: string; emailError?: string | null };
    if (updated.emailStatus === "failed") {
      throw new HttpsError("internal", updated.emailError || "Couldn't send the invite email.");
    }

    return { success: true };
  }
);
