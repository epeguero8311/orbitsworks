import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { auth, db } from "./firebase";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accountDisabled, setAccountDisabled] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);

      if (user) {
        try {
          const userDocRef = doc(db, "users", user.uid);
          const userDocSnap = await getDoc(userDocRef);

          if (userDocSnap.exists()) {
            setUserData(userDocSnap.data());
          } else {
            setUserData(null);
          }
        } catch (error) {
          console.log("Error fetching user data:", error);
          setUserData(null);
        }
      } else {
        setUserData(null);
        setAccountDisabled(false);
      }

      setLoading(false);
    });

    return unsubscribe;
  }, []);

  // Live-watch the linked employee record for supervisors so a
  // deactivation done on the web takes effect immediately, instead of
  // waiting on the next Firebase Auth token refresh.
  useEffect(() => {
    if (!currentUser || !userData || userData.role !== "supervisor" || !userData.companyId) {
      return;
    }

    const employeeRef = doc(
      db,
      "companies",
      userData.companyId,
      "employees",
      currentUser.uid
    );

    const unsubscribe = onSnapshot(
      employeeRef,
      (snap) => {
        if (!snap.exists() || snap.data().active === false) {
          setAccountDisabled(true);
        }
      },
      (error) => {
        console.log("Employee status listener error:", error);
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

  const value = { currentUser, userData, loading, accountDisabled, signOutUser };

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
