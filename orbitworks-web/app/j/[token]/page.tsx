import type { Metadata } from "next";
import { connection } from "next/server";
import { getPublicJoinState } from "@/lib/joinCodes/server";
import { getJoinLandingConfig } from "@/lib/appLinks";
import JoinCodeLanding from "@/components/join/JoinCodeLanding";

// Public landing for a crew code QR. Read on the server.
// no-referrer: the URL holds the token, so never send it on to other sites.
export const metadata: Metadata = { title: "Join on OrbitsWorks", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function JoinCodePage({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  const result = await getPublicJoinState(token);
  return <JoinCodeLanding result={result} token={token} config={getJoinLandingConfig()} />;
}
