import type { Metadata } from "next";
import { connection } from "next/server";
import { Orbit } from "lucide-react";
import { getPublicJoinState } from "@/lib/joinCodes/server";

// Public landing for a company QR. Read on the server; shows nothing about
// the company beyond its name. Phase 1 placeholder - joining is Phase 2.
export const metadata: Metadata = { title: "Join on OrbitsWorks", robots: { index: false, follow: false } };

export default async function JoinCodePage({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  const result = await getPublicJoinState(token);

  let heading = "This code is no longer active";
  let body = "Ask your admin for a new QR code.";
  if (result.state === "live") {
    heading = "Get the OrbitsWorks app";
    body = `Download the OrbitsWorks app to join ${result.companyName}.`;
  } else if (result.state === "accountProblem") {
    heading = "There's a problem with this company's account.";
    body = "Please speak to your admin.";
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent/10">
          <Orbit className="h-6 w-6 text-accent" />
        </div>
        <h1 className="text-lg font-semibold text-gray-950">{heading}</h1>
        <p className="mt-2 text-sm text-gray-600">{body}</p>
      </div>
    </main>
  );
}
