import "server-only";
import { randomBytes, randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { isProPlan } from "@/lib/stripe/tiers";
import {
  joinCodeCreateSchema,
  joinCodeTokenField,
  joinCodeUpdateSchema,
  withActiveCap,
} from "@/lib/validators/joinCode";
import type { JoinCode, JoinCodeListItem, JoinCodeListResponse, JoinCodeStatus } from "@/lib/types";

// Server-only logic for the Pro company join code (QR). Used by
// app/api/join-codes/* and app/j/[token]. joinCodes/{token} is denied to
// every client in firestore.rules, so the Admin SDK here is the only path.
// Never log a token - log() below redacts anything token-shaped.
// The token in the /j/{token} path (and so in hosting request logs) is accepted: the QR link is public by design, joinCompany enforces limits, and admins can revoke.

const TOKEN_BYTES = 24;
const ADMIN_ROLES = new Set(["admin", "owner"]);

type JoinCodeDoc = Omit<JoinCode, "id" | "expiresAt" | "createdAt" | "updatedAt" | "revokedAt"> & {
  expiresAt: Timestamp | null;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  revokedAt: Timestamp | null;
};

interface CompanyPlanFields {
  name?: string;
  planTier?: string | null;
  employeeCap?: number | null;
  activeEmployeeCount?: number;
}

export interface Seats {
  activeCap: number | null;
  activeCount: number;
  seatsLeft: number | null;
}

export interface ProAdminCaller {
  uid: string;
  companyId: string;
  seats: Seats;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function redact(text: string): string {
  return text.replace(/[A-Za-z0-9_-]{32,}/g, "[redacted]");
}

function log(route: string, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[join-codes] ${route} failed: ${redact(message)}`);
}

export function errorResponse(route: string, err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  log(route, err);
  return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
}

export async function readJsonBody(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiError(400, "Invalid request body.");
  }
}

// Seats come from the company doc only: employeeCap (set by the Stripe
// webhook from the tier) and activeEmployeeCount (onEmployeeWrite counter).
export function seatsFrom(company: CompanyPlanFields): Seats {
  const activeCap = company.employeeCap ?? null;
  const activeCount = company.activeEmployeeCount ?? 0;
  const seatsLeft = activeCap === null ? null : Math.max(0, activeCap - activeCount);
  return { activeCap, activeCount, seatsLeft };
}

// Every /api/join-codes/* route: valid ID token, role admin|owner from
// claims, companyId from claims (never the body), company on a Pro plan
// read from the server-side company doc.
export async function requireProAdmin(request: NextRequest): Promise<ProAdminCaller> {
  const header = request.headers.get("authorization") || "";
  const idToken = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!idToken) throw new ApiError(401, "Missing auth token.");

  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(idToken);
  } catch {
    throw new ApiError(401, "Invalid auth token.");
  }
  const role = decoded.role as string | undefined;
  const companyId = decoded.companyId as string | undefined;
  if (!companyId || !role || !ADMIN_ROLES.has(role)) {
    throw new ApiError(403, "Not authorized.");
  }

  const companySnap = await adminDb.collection("companies").doc(companyId).get();
  const company = (companySnap.data() ?? {}) as CompanyPlanFields;
  if (!companySnap.exists || !isProPlan(company.planTier)) {
    throw new ApiError(403, "QR codes are a Pro feature.");
  }
  return { uid: decoded.uid, companyId, seats: seatsFrom(company) };
}

export function generateJoinToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function computeJoinCodeStatus(code: JoinCodeDoc, seatsLeft: number | null, nowMs: number = Date.now()): JoinCodeStatus {
  if (code.status === "revoked" || code.replacedByToken) return "revoked";
  if (code.expiresAt && code.expiresAt.toMillis() <= nowMs) return "expired";
  if (code.userLimit !== null && code.joinedCount >= code.userLimit) return "full";
  if (seatsLeft === 0) return "noSeats";
  return "active";
}

const codesRef = () => adminDb.collection("joinCodes");

async function namesById(companyId: string, sub: "jobSites" | "subcontractors", ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  const names = new Map<string, string>();
  if (unique.length === 0) return names;
  const col = adminDb.collection("companies").doc(companyId).collection(sub);
  const snaps = await adminDb.getAll(...unique.map((id) => col.doc(id)));
  for (const s of snaps) {
    if (s.exists) names.set(s.id, String(s.get("name") ?? ""));
  }
  return names;
}

export async function listJoinCodes(caller: ProAdminCaller): Promise<JoinCodeListResponse> {
  const snap = await codesRef().where("companyId", "==", caller.companyId).get();
  // Regenerated-away docs are history, not rows - the live token per codeId
  // is the one with no replacedByToken.
  const docs = snap.docs
    .map((d) => ({ token: d.id, data: d.data() as JoinCodeDoc }))
    .filter((d) => !d.data.replacedByToken);

  const siteNames = await namesById(caller.companyId, "jobSites", docs.map((d) => d.data.siteId));
  const subNames = await namesById(caller.companyId, "subcontractors", docs.flatMap((d) => d.data.subcontractorIds ?? []));
  const now = Date.now();

  const codes: JoinCodeListItem[] = docs.map(({ token, data }) => ({
    token,
    codeId: data.codeId,
    name: data.name,
    siteId: data.siteId,
    siteName: siteNames.get(data.siteId) ?? "(deleted site)",
    subcontractorIds: data.subcontractorIds ?? [],
    subcontractorNames: (data.subcontractorIds ?? []).map((id) => subNames.get(id) ?? "(deleted)"),
    locationRequired: data.locationRequired,
    userLimit: data.userLimit,
    expiresAt: data.expiresAt ? data.expiresAt.toMillis() : null,
    joinedCount: data.joinedCount ?? 0,
    status: computeJoinCodeStatus(data, caller.seats.seatsLeft, now),
    createdAt: data.createdAt ? data.createdAt.toMillis() : null,
  }));
  codes.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  return { ...caller.seats, codes };
}

function parseOrThrow<T>(result: { success: true; data: T } | { success: false; error: { issues: { message: string }[] } }): T {
  if (!result.success) throw new ApiError(400, result.error.issues[0]?.message ?? "Invalid input.");
  return result.data;
}

// Site and subcontractors must belong to the caller's company. A newly
// picked site/sub must be active; one already on the code may stay even if
// it was deactivated since.
async function assertReferences(companyId: string, siteId: string, subIds: string[], existing?: JoinCodeDoc) {
  const company = adminDb.collection("companies").doc(companyId);
  const site = await company.collection("jobSites").doc(siteId).get();
  if (!site.exists) throw new ApiError(400, "Pick a job site.");
  if (site.get("active") === false && existing?.siteId !== siteId) {
    throw new ApiError(400, "That job site is inactive.");
  }
  const unique = [...new Set(subIds)];
  if (unique.length === 0) return;
  const subs = await adminDb.getAll(...unique.map((id) => company.collection("subcontractors").doc(id)));
  for (const s of subs) {
    if (!s.exists) throw new ApiError(400, "Pick subcontractors from your list.");
    const wasOnCode = existing?.subcontractorIds?.includes(s.id) ?? false;
    if (s.get("active") === false && !wasOnCode) throw new ApiError(400, "One of those subcontractors is inactive.");
  }
}

function toExpiry(iso: string | null): Timestamp | null {
  return iso === null ? null : Timestamp.fromMillis(new Date(iso).getTime());
}

export async function createJoinCode(caller: ProAdminCaller, body: unknown): Promise<{ token: string }> {
  const input = parseOrThrow(withActiveCap(joinCodeCreateSchema, caller.seats.activeCap).safeParse(body));
  await assertReferences(caller.companyId, input.siteId, input.subcontractorIds);

  const token = generateJoinToken();
  const doc: Omit<JoinCodeDoc, "createdAt" | "updatedAt"> & { createdAt: FieldValue; updatedAt: FieldValue } = {
    codeId: randomUUID(),
    name: input.name,
    companyId: caller.companyId,
    siteId: input.siteId,
    subcontractorIds: [...new Set(input.subcontractorIds)],
    locationRequired: input.locationRequired,
    userLimit: input.userLimit,
    expiresAt: toExpiry(input.expiresAt),
    joinedCount: 0,
    status: "active",
    createdByUid: caller.uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    revokedAt: null,
    replacedByToken: null,
  };
  await codesRef().doc(token).create(doc);
  return { token };
}

// Another company's code (or a missing one) is a 404, never a 403 - don't
// confirm the token exists.
function ownedOrThrow(snap: FirebaseFirestore.DocumentSnapshot, companyId: string): JoinCodeDoc {
  const data = snap.data() as JoinCodeDoc | undefined;
  if (!snap.exists || !data || data.companyId !== companyId) throw new ApiError(404, "QR code not found.");
  return data;
}

function liveOrThrow(code: JoinCodeDoc) {
  if (code.status === "revoked" || code.replacedByToken) throw new ApiError(409, "This QR code was revoked.");
}

export async function updateJoinCode(caller: ProAdminCaller, body: unknown): Promise<{ token: string }> {
  const token = tokenFromBody(body);
  const ref = codesRef().doc(token);
  const existing = ownedOrThrow(await ref.get(), caller.companyId);
  liveOrThrow(existing);

  const input = parseOrThrow(withActiveCap(joinCodeUpdateSchema, caller.seats.activeCap).safeParse(body));
  await assertReferences(caller.companyId, input.siteId, input.subcontractorIds, existing);

  await ref.update({
    name: input.name,
    siteId: input.siteId,
    subcontractorIds: [...new Set(input.subcontractorIds)],
    locationRequired: input.locationRequired,
    userLimit: input.userLimit,
    expiresAt: toExpiry(input.expiresAt),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { token };
}

function tokenFromBody(body: unknown): string {
  const check = joinCodeTokenField.safeParse((body as { token?: unknown } | null)?.token);
  if (!check.success) throw new ApiError(404, "QR code not found.");
  return check.data;
}

// New token doc with the same codeId, settings and joinedCount; the old doc
// is revoked and points at its replacement. One transaction, so a join
// can't land on the old doc after its count was copied.
export async function regenerateJoinCode(caller: ProAdminCaller, body: unknown): Promise<{ token: string }> {
  const oldRef = codesRef().doc(tokenFromBody(body));
  const newToken = generateJoinToken();
  await adminDb.runTransaction(async (tx) => {
    const old = ownedOrThrow(await tx.get(oldRef), caller.companyId);
    liveOrThrow(old);
    const now = FieldValue.serverTimestamp();
    tx.create(codesRef().doc(newToken), {
      codeId: old.codeId,
      name: old.name,
      companyId: old.companyId,
      siteId: old.siteId,
      subcontractorIds: old.subcontractorIds ?? [],
      locationRequired: old.locationRequired,
      userLimit: old.userLimit,
      expiresAt: old.expiresAt,
      joinedCount: old.joinedCount ?? 0,
      status: "active",
      createdByUid: caller.uid,
      createdAt: now,
      updatedAt: now,
      revokedAt: null,
      replacedByToken: null,
    });
    tx.update(oldRef, { status: "revoked", revokedAt: now, replacedByToken: newToken, updatedAt: now });
  });
  return { token: newToken };
}

export async function revokeJoinCode(caller: ProAdminCaller, body: unknown): Promise<{ ok: true }> {
  const ref = codesRef().doc(tokenFromBody(body));
  await adminDb.runTransaction(async (tx) => {
    const code = ownedOrThrow(await tx.get(ref), caller.companyId);
    liveOrThrow(code);
    const now = FieldValue.serverTimestamp();
    tx.update(ref, { status: "revoked", revokedAt: now, updatedAt: now });
  });
  return { ok: true };
}

// ---- Public /j/{token} ----

export type PublicJoinState =
  | { state: "live"; companyName: string }
  | { state: "inactive" } // revoked / expired / unknown token
  | { state: "accountProblem" }; // full / no seats / company not Pro

// Only ever exposes the company name, and only for a live code.
export async function getPublicJoinState(rawToken: string): Promise<PublicJoinState> {
  const check = joinCodeTokenField.safeParse(rawToken);
  if (!check.success) return { state: "inactive" };
  try {
    const snap = await codesRef().doc(check.data).get();
    if (!snap.exists) return { state: "inactive" };
    const code = snap.data() as JoinCodeDoc;
    const companySnap = await adminDb.collection("companies").doc(code.companyId).get();
    const company = (companySnap.data() ?? {}) as CompanyPlanFields;
    const status = computeJoinCodeStatus(code, seatsFrom(company).seatsLeft);
    if (status === "revoked" || status === "expired") return { state: "inactive" };
    if (!companySnap.exists || !isProPlan(company.planTier) || status !== "active") return { state: "accountProblem" };
    return { state: "live", companyName: company.name ?? "your company" };
  } catch (err) {
    log("public lookup", err);
    return { state: "inactive" };
  }
}
