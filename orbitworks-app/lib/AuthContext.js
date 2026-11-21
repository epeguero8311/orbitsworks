import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { onAuthStateChanged, onIdTokenChanged, signOut } from "firebase/auth";
import { doc, collection, query, where, onSnapshot } from "firebase/firestore";
import * as Sentry from "@sentry/react-native";
import { auth, db } from "./firebase";
import {
  REFRESH_RETRY_MS,
  claimsFields,
  leftoverNotice,
  mergeUserData,
  needsRoleRefresh,
  roleFamily,
  toMillis,
  transitionPlan,
} from "./roleSync";
import { countLeftover, drainForRole } from "./roleQueues";

const AuthContext = createContext(null);

// How long the users-doc read gets before falling back to cached claims.
// Online this read takes well under a second.
const USER_DOC_TIMEOUT_MS = 4000;
const TOKEN_TIMEOUT_MS = 1500;
// Longest the splash waits for the server to say whether a supervisor's/
// admin's linked employee record is still active (accountChecked). Offline
// that answer never comes, so the app opens anyway after this.
const ACCOUNT_CHECK_MAX_WAIT_MS = 2000;
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

// role/companyId/employeeId (+ issued-at) from the ID token already stored
// on the device. getIdTokenResult() needs no network while the token is
// fresh; if it is expired that call tries to refresh and fails offline, so
// then decode the stored token directly. Returns null if no usable claims.
async function cachedClaims(user) {
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
  return claimsFields(claims);
}

async function isOnline() {
  try {
    const state = await NetInfo.fetch();
    return state.isConnected !== false && state.isInternetReachable !== false;
  } catch {
    return true;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function sameClaims(a, b) {
  return !!a && !!b && a.role === b.role && a.companyId === b.companyId && a.employeeId === b.employeeId && a.issuedAtMs === b.issuedAtMs;
}

// Reads the linked-employee query result. disabled is true/false only when
// the result came from the server; a cached result (offline cold start,
// where the memory cache is empty, or before the server answers) returns
// disabled: null = unknown, which must never show Account deactivated.
// From the server: no linked record or active === false -> deactivated.
// Employee App logins (inactiveStaysSignedIn): only "no linked record" is
// deactivated - an inactive employee stays signed in and Employee Home
// shows "Your account is inactive, speak to your admin" instead.
function linkedEmployeeStatus(snap, inactiveStaysSignedIn = false) {
  const first = snap.empty ? null : snap.docs[0];
  const employeeId = first ? first.id : null;
  if (snap.metadata.fromCache) return { employeeId, disabled: null };
  if (!first) return { employeeId: null, disabled: true };
  if (inactiveStaysSignedIn) return { employeeId, disabled: false };
  return { employeeId, disabled: first.data().active === false };
}

function tagSentryUser(user, data) {
  if (!data) return;
  // id only: no email (or other personal data) in Sentry.
  Sentry.setUser({ id: user.uid });
  Sentry.setTag("companyId", data.companyId ?? "unknown");
  Sentry.setTag("role", data.role ?? "unknown");
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  // RC1: kept apart. The screens route by the TOKEN's role (what the rules
  // check); users/{uid} only adds name etc. and says when the role changed.
  const [usersDoc, setUsersDoc] = useState(null);
  const [claims, setClaims] = useState(null);
  const userData = useMemo(() => mergeUserData(usersDoc, claims), [usersDoc, claims]);
  // RC1: a role change in progress (null = none).
  //   { kind, step: "sending" | "switching" } - full-screen "Updating your access"
  //   { kind, step: "notice", notice }        - what's still on the phone, OK to close
  const [roleUpdate, setRoleUpdate] = useState(null);
  const claimsRef = useRef(null);
  const usersDocRef = useRef(null);
  const handledChangeRef = useRef(null);
  const reconcilingRef = useRef(false);
  const againRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [accountDisabled, setAccountDisabled] = useState(false);
  const [linkedEmployeeId, setLinkedEmployeeId] = useState(null);
  // uid whose account-active check has finished (server answer, error, or
  // ACCOUNT_CHECK_MAX_WAIT_MS). App.js keeps the splash up until then, so a
  // deactivated supervisor never sees home before Account deactivated.
  const [accountCheckedUid, setAccountCheckedUid] = useState(null);

  const applyClaims = useCallback((next) => {
    claimsRef.current = next;
    setClaims(next);
  }, []);

  // RC1: the token's role went from `from` to `to` without this phone
  // sending first (the SDK's own hourly refresh, or a refresh we forced):
  // say what the old role left on the phone.
  const noticeLeftover = useCallback(async (from, to, oldClaims) => {
    const plan = transitionPlan(from, to);
    if (!plan.drain) return;
    const leftover = await countLeftover(plan.drain, oldClaims);
    const notice = leftoverNotice(plan.kind, leftover);
    setRoleUpdate(notice ? { kind: plan.kind, step: "notice", notice } : null);
  }, []);

  // RC1: make the token match users/{uid}. Single-flight; a call while one
  // runs makes it go round once more. Never switches screens before the
  // token has the new role, and does nothing offline (the current screens
  // keep matching the current token; retried on reconnect/foreground).
  const reconcileRole = useCallback(
    async (user) => {
      if (!user) return;
      if (reconcilingRef.current) {
        againRef.current = true;
        return;
      }
      reconcilingRef.current = true;
      try {
        do {
          againRef.current = false;
          if (auth.currentUser?.uid !== user.uid) return;
          const docNow = usersDocRef.current;
          const cur = claimsRef.current;
          if (!docNow) return;

          // A token with no role yet (fresh sign-up): one forced refresh.
          if (!cur) {
            if (!(await isOnline())) return;
            const r = await user.getIdTokenResult(true).catch(() => null);
            const c = r ? claimsFields(r.claims) : null;
            if (c) applyClaims(c);
            continue;
          }

          if (!needsRoleRefresh({ claims: cur, usersDoc: docNow, handledChangeMs: handledChangeRef.current })) continue;
          if (!(await isOnline())) return;

          const plan = transitionPlan(cur.role, docNow.role);
          Sentry.addBreadcrumb({
            category: "roleSync",
            message: "roleChange:start",
            level: "info",
            data: { from: cur.role, to: docNow.role, kind: plan.kind },
          });

          // 1. Send what the old role saved here, with the old token.
          if (plan.drain) {
            setRoleUpdate({ kind: plan.kind, step: "sending" });
            await drainForRole(plan.drain, cur, plan.drainMaxMs);
          }

          // 2. New token, retrying while the server catches up.
          if (plan.kind !== "sameScreens") setRoleUpdate({ kind: plan.kind, step: "switching" });
          let next = null;
          for (const wait of REFRESH_RETRY_MS) {
            if (wait) await sleep(wait);
            if (auth.currentUser?.uid !== user.uid) return;
            try {
              next = claimsFields((await user.getIdTokenResult(true)).claims);
            } catch {
              break; // offline / network: stay as we are, try again later
            }
            if (next && next.role === usersDocRef.current?.role) break;
          }
          handledChangeRef.current = toMillis(usersDocRef.current?.roleChangedAt);

          // 3. Switch (only to what the token really says).
          const leftover = plan.drain ? await countLeftover(plan.drain, cur) : 0;
          if (next) applyClaims(next);
          const switched = !!next && roleFamily(next.role) !== roleFamily(cur.role);
          const notice = switched ? leftoverNotice(plan.kind, leftover) : null;
          setRoleUpdate(notice ? { kind: plan.kind, step: "notice", notice } : null);
          Sentry.addBreadcrumb({
            category: "roleSync",
            message: "roleChange:done",
            level: "info",
            data: { from: cur.role, to: next?.role ?? null, wanted: docNow.role, leftover },
          });
          if (next && next.role !== usersDocRef.current?.role) {
            Sentry.captureMessage("roleSync:claimsLag", {
              level: "warning",
              tags: { area: "roleSync" },
              contexts: { roleSync: { tokenRole: next.role, usersDocRole: usersDocRef.current?.role } },
            });
          }
        } while (againRef.current);
      } finally {
        reconcilingRef.current = false;
        // Left early (offline, signed out): never leave the full-screen
        // "Updating" up. A notice stays until closed.
        setRoleUpdate((prev) => (prev && prev.step === "notice" ? prev : null));
      }
    },
    [applyClaims]
  );

  useEffect(() => {
    // uid of the user the latest auth callback is for, so a slow read that
    // finishes after sign-out / account switch is ignored.
    let activeUid = null;
    let unsubscribeUsersDoc = null;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      activeUid = user ? user.uid : null;
      if (unsubscribeUsersDoc) {
        unsubscribeUsersDoc();
        unsubscribeUsersDoc = null;
      }
      handledChangeRef.current = null;
      usersDocRef.current = null;

      if (user) {
        // RC1: watch users/{uid} for the whole session (it was read once),
        // so a role change on the website reaches a running app.
        let resolveFirstDoc;
        const firstDoc = new Promise((resolve) => {
          resolveFirstDoc = resolve;
        });
        unsubscribeUsersDoc = onSnapshot(
          doc(db, "users", user.uid),
          (snap) => {
            if (activeUid !== user.uid) return;
            if (!snap.exists()) {
              // Offline cold start: the memory cache has nothing - not an answer.
              if (!snap.metadata.fromCache) resolveFirstDoc(null);
              return;
            }
            const data = snap.data();
            usersDocRef.current = data;
            setUsersDoc(data);
            resolveFirstDoc(data);
            reconcileRole(user);
          },
          (error) => {
            resolveFirstDoc(null);
            console.log("Error watching user data:", error);
            if (error?.code === "unavailable") return;
            Sentry.captureException(error, {
              tags: { area: "auth-fetch-user-doc" },
              contexts: { auth: { uid: user.uid } },
            });
          }
        );

        // Fast path: role + companyId are already in the ID token stored on
        // the phone, so the app can start (and start loading company data)
        // without waiting on the users-doc round trip - up to 4 s on a weak
        // signal. Those token claims are exactly what firestore.rules check,
        // and (RC1) the screens keep routing by them even after the users
        // doc lands - only a token refresh changes the role.
        const tokenClaims = await cachedClaims(user);
        if (activeUid !== user.uid) return;
        if (tokenClaims) {
          tagSentryUser(user, tokenClaims);
          applyClaims(tokenClaims);
          setCurrentUser(user);
          setLoading(false);
          reconcileRole(user);
          return;
        }

        // No usable claims on the phone: wait for the users doc as before.
        // Offline (airplane mode cold start: Firestore here is memory-cache
        // only) this times out and the app opens with no role.
        const data = await withTimeout(firstDoc, USER_DOC_TIMEOUT_MS).catch(() => null);
        if (activeUid !== user.uid) return;
        tagSentryUser(user, data);
        applyClaims(null);
        setCurrentUser(user);
        setLoading(false);
        reconcileRole(user);
        return;
      }

      setCurrentUser(null);
      setUsersDoc(null);
      applyClaims(null);
      setRoleUpdate(null);
      setAccountDisabled(false);
      setLinkedEmployeeId(null);
      setAccountCheckedUid(null);
      Sentry.setUser(null);
      setLoading(false);
    });

    // RC1: the SDK refreshes the token by itself about hourly - after a role
    // change on the website that alone can carry the new role. Follow it
    // (the token is what the rules check), unless reconcileRole is mid-way
    // (it applies the new claims itself, after sending the old queue).
    const unsubscribeToken = onIdTokenChanged(auth, async (user) => {
      if (!user || activeUid !== user.uid || reconcilingRef.current) return;
      const next = await cachedClaims(user);
      const cur = claimsRef.current;
      if (!next || !cur || sameClaims(next, cur) || activeUid !== user.uid || reconcilingRef.current) return;
      applyClaims(next);
      if (roleFamily(next.role) !== roleFamily(cur.role)) noticeLeftover(cur.role, next.role, cur);
    });

    // RC1: a role change seen offline is retried when the app can refresh.
    const retry = () => {
      if (auth.currentUser) reconcileRole(auth.currentUser);
    };
    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") retry();
    });
    let wasOffline = false;
    const unsubscribeNet = NetInfo.addEventListener((state) => {
      const offline = state.isConnected === false || state.isInternetReachable === false;
      if (wasOffline && !offline) retry();
      wasOffline = offline;
    });

    return () => {
      unsubscribe();
      unsubscribeToken();
      if (unsubscribeUsersDoc) unsubscribeUsersDoc();
      appStateSub.remove();
      unsubscribeNet();
    };
  }, [applyClaims, reconcileRole, noticeLeftover]);

  // Live-watch the linked employee record for supervisors, admins, and
  // Employee App logins (all can have a linked employee doc and clock in on
  // mobile - see join page copy) so a deactivation done on the web takes
  // effect immediately, instead of waiting on the next Firebase Auth token
  // refresh. firestore.rules lets an employee run this exact query on their
  // own doc only.
  useEffect(() => {
    if (!currentUser) return;
    const uid = currentUser.uid;
    if (
      !userData ||
      (userData.role !== "supervisor" && userData.role !== "admin" && userData.role !== "employee") ||
      !userData.companyId
    ) {
      // No linked-employee check for this account: nothing to wait for.
      setAccountCheckedUid(uid);
      return;
    }
    const markChecked = () => setAccountCheckedUid(uid);
    const maxWait = setTimeout(markChecked, ACCOUNT_CHECK_MAX_WAIT_MS);

    // employees doc ID is never assumed to equal the linked auth uid - a
    // supervisor promoted-in-place keeps their original employee doc ID,
    // and a fresh invite gets an auto-generated one. linkedUserId is the
    // join, so this has to be a query, not a doc(uid) lookup.
    // Employee App logins can't read the employee doc (it holds the PIN) -
    // they watch the server-written employeeSelfViews copy instead, which
    // has the same id, active and linkedUserId fields.
    const collectionName = userData.role === "employee" ? "employeeSelfViews" : "employees";
    const employeesRef = collection(db, "companies", userData.companyId, collectionName);
    const employeeQuery = query(employeesRef, where("linkedUserId", "==", currentUser.uid));

    const unsubscribe = onSnapshot(
      employeeQuery,
      // Metadata changes too, so the cache -> server switch always fires
      // (an empty cached result followed by an identical empty server
      // result would otherwise raise no second event).
      { includeMetadataChanges: true },
      (snap) => {
        const status = linkedEmployeeStatus(snap, userData.role === "employee");
        if (status.employeeId) setLinkedEmployeeId(status.employeeId);
        if (status.disabled === null) return;
        if (!status.employeeId) setLinkedEmployeeId(null);
        setAccountDisabled(status.disabled);
        markChecked();
      },
      (error) => {
        markChecked();
        console.log("Employee status listener error:", error);
        Sentry.captureException(error, {
          tags: { area: "auth-employee-listener" },
          contexts: {
            auth: { uid: currentUser.uid, companyId: userData.companyId },
          },
        });
      }
    );

    return () => {
      clearTimeout(maxWait);
      unsubscribe();
    };
  }, [currentUser, userData]);

  const signOutUser = async () => {
    try {
      await signOut(auth);
    } finally {
      setAccountDisabled(false);
      setRoleUpdate(null);
    }
  };

  const dismissRoleNotice = useCallback(() => {
    setRoleUpdate((prev) => (prev && prev.step === "notice" ? null : prev));
  }, []);

  const accountChecked = !!currentUser && accountCheckedUid === currentUser.uid;
  const value = {
    currentUser,
    userData,
    loading,
    accountDisabled,
    accountChecked,
    linkedEmployeeId,
    signOutUser,
    roleUpdate,
    dismissRoleNotice,
  };

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
