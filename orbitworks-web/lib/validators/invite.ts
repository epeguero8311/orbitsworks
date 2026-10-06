import { z } from "zod";

// app/api/invites/lookup - pre-auth, so this is the only validation this
// input ever gets before touching Firestore (no isAdminOrOwner/companyId
// check possible yet, there's no signed-in user).
export const inviteLookupRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

export type InviteLookupRequest = z.infer<typeof inviteLookupRequestSchema>;
