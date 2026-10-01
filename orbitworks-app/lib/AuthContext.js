import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, collection, query, where, onSnapshot } from "firebase/firestore";
import * as Sentry from "@sentry/react-native";
import { auth, db } from "./firebase";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accountDisabled, setAccountDisabled] = useState(false);
  const [linkedEmployeeId, setLinkedEmployeeId] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);

      if (user) {
        try {
          const userDocRef = doc(db, "users", user.uid);
          const userDocSnap = await getDoc(userDocRef);

          if (userDocSnap.exists()) {
            const data = userDocSnap.data();
            setUserData(data);
            Sentry.setUser({ id: user.uid, email: user.email ?? undefined });
            Sentry.setTag("companyId", data.companyId ?? "unknown");
            Sentry.setTag("role", data.role ?? "unknown");
          } else {
            setUserData(null);
          }
        } catch (error) {
          console.log("Error fetching user data:", error);
          Sentry.captureException(error, {
            tags: { area: "auth-fetch-user-doc" },
            contexts: { auth: { uid: user.uid } },
          });
          setUserData(null);
        }
      } else {
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
