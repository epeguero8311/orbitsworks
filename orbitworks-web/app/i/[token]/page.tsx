import type { Metadata } from "next";
import { connection } from "next/server";
import { getPublicInviteState } from "@/lib/employeeInvites/server";
import { getJoinLandingConfig } from "@/lib/appLinks";
import InviteLanding from "@/components/join/InviteLanding";

// Public landing for an Employee App email invite (Phase 3B). Read on the
// server. no-referrer: the URL holds the token, so never send it on.
export const metadata: Metadata = { title: "Your OrbitsWorks invite", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  const result = await getPublicInviteState(token);
  return <InviteLanding result={result} token={token} config={getJoinLandingConfig()} />;
}
