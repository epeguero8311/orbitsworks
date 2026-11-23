import { connection } from "next/server";
import { appLinkResponse, buildAssetLinks } from "@/lib/appLinks";

// Android App Links for crew code QR links. See lib/appLinks.ts.
export async function GET() {
  await connection();
  return appLinkResponse(buildAssetLinks(process.env.APP_LINKS_ANDROID_PACKAGE, process.env.APP_LINKS_ANDROID_SHA256));
}
