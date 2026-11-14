import { z } from "zod";

// ---- acceptInvite (supervisor/admin invites, website /join) ----
//
// inviteId is the invite the person came from: the email link and the
// website's "Copy link" carry it as /join?email=...&invite=<id>. It is
// optional so links sent before it existed, and the live website until it
// is updated, keep working (see pickStaffInvite). Not .strict() for the
// same reason.
export const acceptInviteSchema = z.object({
  name: z.string().optional(),
  inviteId: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{1,128}$/, "That invite link isn't valid.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;

export interface StaffInviteCandidate {
  id: string;
  email?: string;
  status?: string;
}

export type StaffInvitePick =
  | { ok: true; id: string }
  | { ok: false; reason: "notFound" | "notForThisEmail" | "notPending" | "ambiguous" };

// Which invite acceptInvite may use.
// - With an inviteId: exactly that invite, and only if it is still pending
//   and addressed to the signed-in email.
// - Without one (an older link): the single pending invite for the email.
//   With more than one pending invite there is no way to know which
//   company the person meant, so nothing is picked.
export function pickStaffInvite(
  email: string,
  inviteId: string | undefined,
  byId: StaffInviteCandidate | null,
  pendingForEmail: StaffInviteCandidate[]
): StaffInvitePick {
  const want = email.trim().toLowerCase();
  if (inviteId) {
    if (!byId) return { ok: false, reason: "notFound" };
    if ((byId.email ?? "").trim().toLowerCase() !== want) return { ok: false, reason: "notForThisEmail" };
    if (byId.status !== "pending") return { ok: false, reason: "notPending" };
    return { ok: true, id: byId.id };
  }
  const pending = pendingForEmail.filter(
    (i) => i.status === "pending" && (i.email ?? "").trim().toLowerCase() === want
  );
  if (pending.length === 0) return { ok: false, reason: "notFound" };
  if (pending.length > 1) return { ok: false, reason: "ambiguous" };
  return { ok: true, id: pending[0].id };
}
