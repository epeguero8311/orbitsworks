import { Orbit } from "lucide-react";
import type { PublicJoinState } from "@/lib/joinCodes/server";
import type { JoinLandingConfig } from "@/lib/appLinks";

// Public landing for a crew code QR (/j/{token}). Shows nothing about the
// company beyond its name. If the app is installed, the QR link itself
// opens it (universal link). Otherwise: install, then scan again inside
// the app - a token can't survive an App Store install.
interface Props {
  result: PublicJoinState;
  token: string;
  config: JoinLandingConfig;
}

export default function JoinCodeLanding({ result, token, config }: Props) {
  let heading = "This code is no longer active";
  let body = "Ask your admin for a new QR code.";
  if (result.state === "accountProblem") {
    heading = "There's a problem with this company's account.";
    body = "Please speak to your admin.";
  }
  const live = result.state === "live";
  if (live) {
    heading = `Join ${result.companyName}`;
    body = `Sign up in the ${config.appName} app.`;
  }

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
            href={`${config.scheme}://j/${encodeURIComponent(token)}`}
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
              <li>Open it and tap Join with crew code.</li>
              <li>Scan this QR code again.</li>
            </ol>
          </div>
        ) : null}
      </div>
    </main>
  );
}
