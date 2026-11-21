// RC1 (role change while signed in): the users/{uid} fields that say
// which role a login has, and when it last changed.
//
// setEmployeeRole sets the custom claims FIRST, then writes role +
// roleChangedAt here. The app watches users/{uid}: when roleChangedAt is
// newer than its ID token (or the role differs from the token's), it
// forces a token refresh, so the role it routes by is always the role
// firestore.rules check. Only the Admin SDK writes users/{uid}
// (firestore.rules denies every client write).
import type * as admin from "firebase-admin";

export type UserDocRole = "owner" | "admin" | "supervisor" | "employee";

export interface UserDocRoleFields {
  role: UserDocRole;
  companyId: string;
  // Set on every role change made while the account exists (never on
  // sign-up). Missing = the role never changed.
  roleChangedAt?: admin.firestore.Timestamp;
}
