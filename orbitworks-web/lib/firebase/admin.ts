import { initializeApp, getApps, getApp, cert, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

// Lazily initialized so importing this module never throws at build time.
// Next.js imports every API route module during "Collecting page data" at
// build time, before RUNTIME-only secrets (FIREBASE_ADMIN_*) are available -
// only BUILD-availability env vars are present then. Initializing eagerly at
// module scope broke `next build` / Firebase App Hosting rollouts.
let _app: App | null = null;

function getAdminApp(): App {
  if (_app) return _app;
  if (getApps().length) {
    _app = getApp();
    return _app;
  }

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY
    ? process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n")
    : undefined;

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Missing FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, or FIREBASE_ADMIN_PRIVATE_KEY in the environment."
    );
  }

  _app = initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  return _app;
}

let _adminAuth: Auth | null = null;
let _adminDb: Firestore | null = null;

function getAdminAuthClient(): Auth {
  if (!_adminAuth) _adminAuth = getAuth(getAdminApp());
  return _adminAuth;
}

function getAdminDbClient(): Firestore {
  if (!_adminDb) _adminDb = getFirestore(getAdminApp());
  return _adminDb;
}

// Backward-compatible exports - existing `import { adminAuth, adminDb } from
// "@/lib/firebase/admin"` call sites don't need to change. Real clients (and
// the env var check) are only created on first actual property access at
// request time, never at import time.
export const adminAuth: Auth = new Proxy({} as Auth, {
  get(_target, prop, receiver) {
    const client = getAdminAuthClient();
    const value = Reflect.get(client as object, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export const adminDb: Firestore = new Proxy({} as Firestore, {
  get(_target, prop, receiver) {
    const client = getAdminDbClient();
    const value = Reflect.get(client as object, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});