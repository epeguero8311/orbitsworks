"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "./firebase";

type UserRole = "admin" | "supervisor";

type UserData = {
  role: UserRole;
  companyId: string;
  name?: string;
  email?: string;
  assignedSiteIds?: string[];
};

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

            // Don't trust the Firestore doc alone - confirm the ID token's
            // custom claims actually match before letting any page query
            // Firestore, since rules check the token, not this doc.
            const claimsReady = await waitForClaims(user, {
              role: data.role,
              companyId: data.companyId,
            });

            if (cancelled) return;

            if (!claimsReady) {
              console.error(
                "Auth claims did not propagate in time for uid:",
                user.uid
              );
            }

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
