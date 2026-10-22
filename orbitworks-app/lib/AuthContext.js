import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, collection, query, where, onSnapshot } from "firebase/firestore";
import * as Sentry from "@sentry/react-native";
import { auth, db } from "./firebase";

const AuthContext = createContext(null);

// How long the users-doc read gets before falling back to cached claims.
// Online this read takes well under a second.
const USER_DOC_TIMEOUT_MS = 4000;
const TOKEN_TIMEOUT_MS = 1500;
const TIMEOUT = new Error("timeout");

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(TIMEOUT), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function decodeJwtClaims(token) {
  const part = token.split(".")[1];
  const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  return JSON.parse(atob(padded));
}

// role/companyId/employeeId from the ID token already stored on the device.
// getIdTokenResult() needs no network while the token is fresh; if it is
// expired that call tries to refresh and fails offline, so then decode the
// stored token directly. Returns null if no usable claims.
async function cachedClaimsUserData(user) {
  let claims = null;
  try {
    claims = (await withTimeout(user.getIdTokenResult(), TOKEN_TIMEOUT_MS)).claims;
  } catch {
    try {
      if (user.accessToken) claims = decodeJwtClaims(user.accessToken);
    } catch {
      claims = null;
    }
  }
  if (!claims || typeof claims.role !== "string" || typeof claims.companyId !== "string") {
    return null;
  }
  return {
    role: claims.role,
    companyId: claims.companyId,
    employeeId: typeof claims.employeeId === "string" ? claims.employeeId : null,
    fromCachedClaims: true,
  };
}

function tagSentryUser(user, data) {
  if (!data) return;
  Sentry.setUser({ id: user.uid, email: user.email ?? undefined });
  Sentry.setTag("companyId", data.companyId ?? "unknown");
  Sentry.setTag("role", data.role ?? "unknown");
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accountDisabled, setAccountDisabled] = useState(false);
  const [linkedEmployeeId, setLinkedEmployeeId] = useState(null);

  useEffect(() => {
    // uid of the user the latest auth callback is for, so a slow users-doc
    // read that finishes after sign-out / account switch is ignored.
    let activeUid = null;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      activeUid = user ? user.uid : null;

      if (user) {
        const userDocPromise = getDoc(doc(db, "users", user.uid));
        let data = null;
        let timedOut = false;
        try {
          const userDocSnap = await withTimeout(userDocPromise, USER_DOC_TIMEOUT_MS);
          data = userDocSnap.exists() ? userDocSnap.data() : null;
        } catch (error) {
          timedOut = error === TIMEOUT;
          if (!timedOut) {
            console.log("Error fetching user data:", error);
            Sentry.captureException(error, {
              tags: { area: "auth-fetch-user-doc" },
              contexts: { auth: { uid: user.uid } },
            });
          }
          // Offline (airplane mode cold start: Firestore here is memory-cache
          // only, so the read waits up to 10s then fails) - fall back to the
          // role/companyId claims in the token already stored on the phone so
          // a signed-in supervisor still reaches clock-in. UI routing only;
          // firestore.rules still enforce the real claims server-side.
          data = await cachedClaimsUserData(user);
        }

        if (activeUid !== user.uid) return;
        tagSentryUser(user, data);
        // Set together, after userData is known, so no render ever sees a
        // signed-in user without their role and companyId.
        setUserData(data);
        setCurrentUser(user);
        setLoading(false);

        // Slow network rather than none: swap in the full users doc once it
        // lands (adds name, assignedSiteIds, etc).
        if (timedOut) {
          userDocPromise
            .then((snap) => {
              if (activeUid !== user.uid || !snap.exists()) return;
              const full = snap.data();
              tagSentryUser(user, full);
              setUserData(full);
            })
            .catch(() => {});
        }
        return;
      } else {
        setCurrentUser(null);
        setUserData(null);
        setAccountDisabled(false);
        setLinkedEmployeeId(null);
        Sentry.setUser(null);
      }

      setLoading(false);
    });

    return unsubscribe;
  }, []);

  // Live-watch the linked employee record for supervisors and admins (both
  // can have a linked employee doc and clock in on mobile - see join
  // page copy) so a deactivation done on the web takes effect
  // immediately, instead of waiting on the next Firebase Auth token
  // refresh.
  useEffect(() => {
    if (
      !currentUser ||
      !userData ||
      (userData.role !== "supervisor" && userData.role !== "admin") ||
      !userData.companyId
    ) {
      return;
    }

    // employees doc ID is never assumed to equal the linked auth uid - a
    // supervisor promoted-in-place keeps their original employee doc ID,
    // and a fresh invite gets an auto-generated one. linkedUserId is the
    // join, so this has to be a query, not a doc(uid) lookup.
    const employeesRef = collection(db, "companies", userData.companyId, "employees");
    const employeeQuery = query(employeesRef, where("linkedUserId", "==", currentUser.uid));

    const unsubscribe = onSnapshot(
      employeeQuery,
      (snap) => {
        if (snap.empty) {
          setAccountDisabled(true);
          setLinkedEmployeeId(null);
          return;
        }
        setLinkedEmployeeId(snap.docs[0].id);
        setAccountDisabled(snap.docs[0].data().active === false);
      },
      (error) => {
        console.log("Employee status listener error:", error);
        Sentry.captureException(error, {
          tags: { area: "auth-employee-listener" },
          contexts: {
            auth: { uid: currentUser.uid, companyId: userData.companyId },
          },
        });
      }
    );

    return unsubscribe;
  }, [currentUser, userData]);

  const signOutUser = async () => {
    try {
      await signOut(auth);
    } finally {
      setAccountDisabled(false);
    }
  };

  const value = { currentUser, userData, loading, accountDisabled, linkedEmployeeId, signOutUser };

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
