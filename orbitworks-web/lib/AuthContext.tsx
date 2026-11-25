"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "./firebase";
import { isFatalRefreshError, tokenRefreshReason } from "./roleRefresh";

// "employee" = Employee App login (self-service clock in/out on mobile).
// Never allowed into the web dashboard - see app/use-app and the
// dashboard layout guard.
// "kiosk" = Task 5 shared wall-tablet login (Kiosk mode in the app). Never
// gets the dashboard - same as "employee" (dashboard layout, login, join).
export type UserRole = "owner" | "admin" | "supervisor" | "employee" | "kiosk";

// Pure role helpers live in lib/roles.ts (server routes use them too).
export { isAppOnlyRole, isStaffRole } from "./roles";

type UserData = {
  role: UserRole;
  companyId: string;
  name?: string;
  email?: string;
  assignedSiteIds?: string[];
  // RC1: set by setEmployeeRole on every role change (server only); the
  // app compares it with its ID token. See functions/src/userRoleTypes.ts.
  roleChangedAt?: { toMillis(): number };
  // Set when this login is deactivated (server only). See lib/roleRefresh.ts.
  accessRevokedAt?: { toMillis(): number };
  // Admin Permissions (Task 4): server-written only (setAdminAccess). Read
  // through useAdminAccess() / lib/adminAccess.ts resolveAdminAccess.
  adminAccess?: unknown;
};

// Owner is a superset of admin - the single original-signup account per
// company, the only role with billing/Stripe access, but otherwise able
// to do everything admin can. Anywhere client code used to check
// role === "admin" to gate a general (non-billing) action should use
// this instead.
export function isAdminOrOwner(role: UserRole | null | undefined): boolean {
  return role === "admin" || role === "owner";
}

type AuthContextType = {
  currentUser: User | null;
  userData: UserData | null;
  loading: boolean;
};

const AuthContext = createContext<AuthContextType>({
  currentUser: null,
  userData: null,
  loading: true,
});

export function useAuth() {
  return useContext(AuthContext);
}

const CLAIMS_POLL_MAX_ATTEMPTS = 6;
const CLAIMS_POLL_DELAY_MS = 500;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Custom claims (role/companyId) are set server-side by a Cloud Function
// that runs AFTER the client is already signed in (on signup / invite
// accept). The ID token the client is holding at that point was minted
// before the claims existed, so Firestore rules checks against
// request.auth.token.companyId will fail even though the Firestore
// "users" doc already has the right data. We poll getIdTokenResult with
// forceRefresh until the token's claims catch up to the expected
// role/companyId, since the Cloud Function can lag by a moment.
async function waitForClaims(
  user: User,
  expected: { role: string; companyId: string }
): Promise<boolean> {
  for (let attempt = 0; attempt < CLAIMS_POLL_MAX_ATTEMPTS; attempt++) {
    const tokenResult = await user.getIdTokenResult(true);
    if (
      tokenResult.claims.companyId === expected.companyId &&
      tokenResult.claims.role === expected.role
    ) {
      return true;
    }
    await delay(CLAIMS_POLL_DELAY_MS * (attempt + 1));
  }
  return false;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeUserDoc: (() => void) | null = null;
    let cancelled = false;
    let snapshotSeq = 0;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (unsubscribeUserDoc) {
        unsubscribeUserDoc();
        unsubscribeUserDoc = null;
      }

      setCurrentUser(user);

      if (user) {
        const userDocRef = doc(db, "users", user.uid);
        unsubscribeUserDoc = onSnapshot(
          userDocRef,
          async (snapshot) => {
            if (!snapshot.exists()) {
              setUserData(null);
              setLoading(false);
              return;
            }

            const data = snapshot.data() as UserData;
            const seq = ++snapshotSeq;

            // Don't trust the Firestore doc alone - rules check the token,
            // not this doc. RC1 follow-up: refresh the token only when it
            // is behind the doc (lib/roleRefresh.ts) - a role change or a
            // deactivation now takes effect within seconds, not when the
            // token expires (up to 1 h).
            try {
              const current = await user.getIdTokenResult();
              const reason = tokenRefreshReason(current.claims, data);
              if (reason === "accessRevoked") {
                // Throws for a disabled login -> signed out below.
                await user.getIdTokenResult(true);
              } else if (reason !== "none") {
                const claimsReady = await waitForClaims(user, {
                  role: data.role,
                  companyId: data.companyId,
                });
                if (!claimsReady) {
                  console.error(
                    "Auth claims did not propagate in time for uid:",
                    user.uid
                  );
                }
              }
            } catch (err) {
              if (isFatalRefreshError(err)) {
                // Deactivated (or deleted) while signed in.
                await signOut(auth).catch(() => {});
                return;
              }
              console.error("Token refresh failed for uid:", user.uid, err);
            }

            // A newer snapshot is already being handled - it decides.
            if (cancelled || seq !== snapshotSeq) return;

            setUserData(data);
            setLoading(false);
          },
          (error) => {
            console.error("User doc listener error:", error);
            setUserData(null);
            setLoading(false);
          }
        );
      } else {
        setUserData(null);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      unsubscribeAuth();
      if (unsubscribeUserDoc) {
        unsubscribeUserDoc();
      }
    };
  }, []);

  return (
    <AuthContext.Provider value={{ currentUser, userData, loading }}>
      {children}
    </AuthContext.Provider>
  );
}
