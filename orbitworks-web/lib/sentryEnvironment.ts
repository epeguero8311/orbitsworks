// Sentry "environment" tag for the website. Only the real project reports
// as "production"; the dev site (orbitworks-dev-ew) and local dev report
// as "dev", so dev noise can be filtered out in Sentry.
const PROD_FIREBASE_PROJECT = "orbitworks-7ef59";

export function sentryEnvironment(): "production" | "dev" {
  return process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID === PROD_FIREBASE_PROJECT ? "production" : "dev";
}
