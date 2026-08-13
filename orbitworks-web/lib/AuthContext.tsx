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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeUserDoc: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      // Clean up any previous user doc listener before attaching a new one.
      if (unsubscribeUserDoc) {
        unsubscribeUserDoc();
        unsubscribeUserDoc = null;
      }

      setCurrentUser(user);

      if (user) {
        // Use a live listener rather than a one-time getDoc. Right after
        // signup, the users doc may not exist for a brief moment while
        // createCompany is still running server-side - a one-time getDoc
        // would race that and permanently miss it. onSnapshot picks up
        // the doc as soon as it's created, with no reload required.
        const userDocRef = doc(db, "users", user.uid);
        unsubscribeUserDoc = onSnapshot(
          userDocRef,
          (snapshot) => {
            if (snapshot.exists()) {
              setUserData(snapshot.data() as UserData);
            } else {
              setUserData(null);
            }
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
