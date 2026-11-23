import { connection } from "next/server";
import { appLinkResponse, buildAppleAppSiteAssociation } from "@/lib/appLinks";

// iOS universal links for crew code QR links. See lib/appLinks.ts.
export async function GET() {
  await connection();
  return appLinkResponse(buildAppleAppSiteAssociation(process.env.APP_LINKS_IOS_APP_IDS));
}
