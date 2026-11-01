// Which website a link in an email points to, picked by the Firebase
// project this function is running in (decision C1). Dev links go to the
// dev site, prod links to orbitsworks.com. Any other project (emulator
// test ids, a new project nobody added here) gets null, and the caller
// marks the email failed instead of sending a link to the wrong site.
//
// The dev URL must match DEV_APP_URL in orbitworks-app/config/envRules.js
// and NEXT_PUBLIC_APP_URL in apphosting.orbitworks_dev.yaml.

export const DEV_PROJECT_ID = "orbitworks-dev-ew";
export const PROD_PROJECT_ID = "orbitworks-7ef59";

export interface SiteConfig {
  baseUrl: string;
  // How the email names the app and where to get it.
  appName: string;
  installFrom: string;
}

const SITES: Record<string, SiteConfig> = {
  [DEV_PROJECT_ID]: {
    baseUrl: "https://orbitsworks-backend--orbitworks-dev-ew.us-central1.hosted.app",
    appName: "OrbitsWorks Dev",
    installFrom: "TestFlight",
  },
  [PROD_PROJECT_ID]: {
    baseUrl: "https://orbitsworks.com",
    appName: "OrbitsWorks",
    installFrom: "the App Store or Google Play",
  },
};

// GCLOUD_PROJECT is set by the Functions runtime (and the emulator).
// Tests pass their own id.
export function currentProjectId(): string {
  return process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "";
}

export function siteFor(projectId: string = currentProjectId()): SiteConfig | null {
  return Object.prototype.hasOwnProperty.call(SITES, projectId) ? SITES[projectId] : null;
}

// Supervisor/admin invite: the website's /join page (decision D1 - this
// used to always point at prod, even on dev).
export function supervisorJoinLink(email: string, projectId?: string): string | null {
  const site = siteFor(projectId);
  return site ? `${site.baseUrl}/join?email=${encodeURIComponent(email)}` : null;
}

// Employee App email invite: the /i/{token} landing page, which the app
// also opens directly as a universal link.
export function employeeInviteLink(token: string, projectId?: string): string | null {
  const site = siteFor(projectId);
  return site ? `${site.baseUrl}/i/${encodeURIComponent(token)}` : null;
}

export const NO_SITE_FOR_PROJECT = "No website is set up for this Firebase project, so no link could be sent.";
