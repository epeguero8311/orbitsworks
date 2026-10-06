import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { inviteLookupRequestSchema } from "@/lib/validators/invite";

// Pre-auth by design - /join calls this before the invitee has a Firebase
// Auth session, so there's no ID token to verify and no companyId to scope
// by (unlike every other app/api route). firestore.rules locks the invites
// collection down to isAdminOrOwner reads, so this is the only way /join
// can look anything up - the Admin SDK bypasses that. Returns only `name`,
// never companyId/role/inviteId/assignedSiteIds, and only for an invite
// that's both pending AND promoting an existing employee
// (linkExistingEmployeeId set) - a fresh invite's name is unknown until
// the invitee types it in, so this always answers null for those, same as
// "not found". acceptInvite re-derives everything from the invite doc
// itself server-side - nothing this route returns is ever trusted as
// input back into it.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = inviteLookupRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }
    const { email } = parsed.data;

    const snap = await adminDb
      .collection("invites")
      .where("email", "==", email)
      .where("status", "==", "pending")
      .limit(1)
      .get();

    if (snap.empty) {
      return NextResponse.json({ name: null });
    }

    const invite = snap.docs[0].data() as { linkExistingEmployeeId?: string; name?: string };
    const name = invite.linkExistingEmployeeId && invite.name ? invite.name : null;

    return NextResponse.json({ name });
  } catch (err) {
    console.error("Invite lookup failed:", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
