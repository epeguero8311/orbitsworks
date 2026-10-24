import { redirect } from "next/navigation";

// Old route. The temporary clock-in link now lives under Crew Access.
export default function TempLinkRedirect() {
  redirect("/dashboard/crew-access?tab=temp-link");
}
