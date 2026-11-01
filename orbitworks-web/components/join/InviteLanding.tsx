import { Orbit } from "lucide-react";
import type { PublicInviteState } from "@/lib/employeeInvites/server";
import type { JoinLandingConfig } from "@/lib/appLinks";

// Public landing for an email invite link (/i/{token}, Phase 3B). If the
// app is installed, the link itself opens it (universal link). Otherwise:
// install, then tap the link in the email again - a token can't survive
// an App Store install (decision F1).
interface Props {
  result: PublicInviteState;
  token: string;
  config: JoinLandingConfig;
}

export default function InviteLanding({ result, token, config }: Props) {
  const live = result.state === "live";
  const heading = live ? `Join ${result.companyName}` : "This invite is no longer active";
  const body = live ? `Set up your account in the ${config.appName} app.` : "Ask your admin to send a new one.";

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent/10">
          <Orbit className="h-6 w-6 text-accent" />
        </div>
        <h1 className="text-lg font-semibold text-gray-950">{heading}</h1>
        <p className="mt-2 text-sm text-gray-600">{body}</p>
        {live && config.scheme ? (
          <a
            href={`${config.scheme}://i/${encodeURIComponent(token)}`}
            className="mt-6 block rounded-full bg-accent px-4 py-3 text-sm font-semibold text-white"
          >
            Open in the app
          </a>
        ) : null}
        {live ? (
          <div className="mt-6 text-left text-sm text-gray-600">
            <p className="font-medium text-gray-900">Don&apos;t have the app yet?</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>Install {config.appName} from {config.installFrom}.</li>
              <li>Come back to your invite email on this phone.</li>
              <li>Tap the invite link again.</li>
            </ol>
            <p className="mt-3">Sign up with the email address the invite was sent to.</p>
          </div>
        ) : null}
      </div>
    </main>
  );
}
