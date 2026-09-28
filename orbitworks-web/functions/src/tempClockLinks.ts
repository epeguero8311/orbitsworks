import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { randomBytes, randomUUID } from "crypto";
import { db, OVERRIDE_REASON_MIN_LENGTH, OVERRIDE_REASON_MAX_LENGTH } from "./shared";
import { classifyGeofence, evaluateEnforcement, type EnforcementMode } from "./geofencing";

// Duplicated from lib/stripe/tiers.ts's isProPlan - see geocoding.ts for
// why this can't just be imported.
function isProPlan(planTier: string | undefined | null): boolean {
  return !!planTier && planTier.startsWith("pro_");
}

const ALLOWED_DURATIONS_MINUTES = new Set([10, 30, 60]);
const TOKEN_BYTES = 24;

// Same event-type -> status mapping as the mobile app's clockStatus.js,
// duplicated here (not importable across the app/functions package
// boundary) so the auto in/out detection below matches the kiosk exactly.
function deriveStatus(eventType: string | null | undefined): "in" | "out" | "break" {
  if (eventType === "in" || eventType === "breakEnd") return "in";
  if (eventType === "breakStart") return "break";
  return "out";
}

// Basic sanity bounds on browser-supplied coordinates - this endpoint has
// no request.auth, so unlike every other write path here there's no
// signed-in caller to trust; a garbage/spoofed value just gets dropped
// rather than written, same "never a blocker" treatment as a real
// permission-denied/GPS-timeout miss.
function parseLocation(
  data: Record<string, unknown> | undefined
): { lat: number; lng: number } | null {
  const lat = data?.lat;
  const lng = data?.lng;
  if (
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return null;
  }
  return { lat, lng };
}

function parseAccuracy(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

async function uploadTempLinkPhoto(
  companyId: string,
  employeeId: string,
  photoBase64: string
): Promise<string> {
  const buffer = Buffer.from(photoBase64.replace(/^data:image\/\w+;base64,/, ""), "base64");
  const bucket = admin.storage().bucket();
  const path = `companies/${companyId}/clockEvents/${employeeId}/${Date.now()}.jpg`;
  const file = bucket.file(path);
  const downloadToken = randomUUID();
  await file.save(buffer, {
    contentType: "image/jpeg",
    metadata: { metadata: { firebaseStorageDownloadTokens: downloadToken } },
  });
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(
    path
  )}?alt=media&token=${downloadToken}`;
}

// Admin/owner-only, Pro-gated. companies/{companyId} is deliberately not
// the parent here - tempClockLinks is a top-level collection keyed by the
// token itself, since the public redeem page (app/clock/[token]) only
// ever has the token, never the companyId, to look the link up by.
// firestore.rules' trailing catch-all already denies all client access to
// any collection not explicitly matched, so this needs no rule of its own -
// only the Admin SDK (this function and redeemTempClockLink) ever touches it.
export const generateTempClockLink = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }
  const callerRole = request.auth.token.role as string | undefined;
  const callerCompanyId = request.auth.token.companyId as string | undefined;
  if ((callerRole !== "admin" && callerRole !== "owner") || !callerCompanyId) {
    throw new HttpsError("permission-denied", "Not authorized.");
  }

  const rawSiteId = (request.data?.siteId ? String(request.data.siteId) : "").trim();
  const durationMinutes = Number(request.data?.durationMinutes);
  if (!rawSiteId) {
    throw new HttpsError("invalid-argument", "siteId is required.");
  }
  if (!ALLOWED_DURATIONS_MINUTES.has(durationMinutes)) {
    throw new HttpsError("invalid-argument", "durationMinutes must be 10, 30, or 60.");
  }

  const companySnap = await db.collection("companies").doc(callerCompanyId).get();
  const planTier = companySnap.data()?.planTier as string | undefined;
  // Duplicated from lib/stripe/tiers.ts's isProPlan (can't import across
  // the functions/web package boundary) - every Pro tier key is prefixed
  // "pro_", so this stays correct as long as that convention holds.
  if (!planTier || !planTier.startsWith("pro_")) {
    throw new HttpsError("permission-denied", "Temp clock-in links require the Pro plan.");
  }

  // "none" is the sentinel the admin UI sends for the No Site option -
  // same siteId: null / siteName: "Not specified" convention the mobile
  // kiosk's SiteSelectScreen already uses, so these clock events look and
  // filter identically to a kiosk clock-in with no site chosen.
  let siteId: string | null = rawSiteId;
  let siteName = "Not specified";
  if (rawSiteId !== "none") {
    const siteSnap = await db
      .collection("companies")
      .doc(callerCompanyId)
      .collection("jobSites")
      .doc(rawSiteId)
      .get();
    if (!siteSnap.exists) {
      throw new HttpsError("not-found", "Job site not found.");
    }
    siteName = (siteSnap.data()?.name as string) ?? "";
  } else {
    siteId = null;
  }

  const callerSnap = await db.collection("users").doc(request.auth.uid).get();
  const createdByName = (callerSnap.data()?.name as string) ?? "Admin";

  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  const now = admin.firestore.Timestamp.now();
  const expiresAt = admin.firestore.Timestamp.fromMillis(now.toMillis() + durationMinutes * 60 * 1000);

  await db
    .collection("tempClockLinks")
    .doc(token)
    .set({
      companyId: callerCompanyId,
      siteId,
      siteName,
      createdByUid: request.auth.uid,
      createdByName,
      createdAt: now,
      expiresAt,
      durationMinutes,
      revoked: false,
      wrongAttemptCount: 0,
    });

  return { token, expiresAt: expiresAt.toMillis(), siteName, createdByName };
});

// Lets the Generate Link page survive a refresh without losing track of a
// still-active link - the collection itself is unreadable by clients (see
// the deny-by-default comment above), so this is the only way the admin
// UI can find out about a link it didn't just create in this session.
export const listActiveTempClockLinks = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }
  const callerRole = request.auth.token.role as string | undefined;
  const callerCompanyId = request.auth.token.companyId as string | undefined;
  if ((callerRole !== "admin" && callerRole !== "owner") || !callerCompanyId) {
    throw new HttpsError("permission-denied", "Not authorized.");
  }

  const now = admin.firestore.Timestamp.now();
  const snap = await db
    .collection("tempClockLinks")
    .where("companyId", "==", callerCompanyId)
    .where("revoked", "==", false)
    .orderBy("expiresAt", "desc")
    .get();

  const links = snap.docs
    .map((d) => {
      const data = d.data();
      return {
        token: d.id,
        siteId: (data.siteId as string | null) ?? null,
        siteName: data.siteName as string,
        createdByName: data.createdByName as string,
        expiresAt: (data.expiresAt as admin.firestore.Timestamp).toMillis(),
        durationMinutes: data.durationMinutes as number,
      };
    })
    .filter((l) => l.expiresAt > now.toMillis());

  return { links };
});

// Full, permanent audit trail - every link this company has ever
// generated, active or not, newest first. Unlike listActiveTempClockLinks
// this never filters by revoked/expiresAt, and nothing in this file ever
// deletes a tempClockLinks doc (revoke only flips a flag) - so once a link
// is generated, who made it and when is visible to every admin/owner on
// the company forever. No corresponding write path is exposed here on
// purpose: this list is read-only by design, not just by UI convention.
export const listTempClockLinkHistory = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }
  const callerRole = request.auth.token.role as string | undefined;
  const callerCompanyId = request.auth.token.companyId as string | undefined;
  if ((callerRole !== "admin" && callerRole !== "owner") || !callerCompanyId) {
    throw new HttpsError("permission-denied", "Not authorized.");
  }

  const snap = await db
    .collection("tempClockLinks")
    .where("companyId", "==", callerCompanyId)
    .orderBy("createdAt", "desc")
    .limit(100)
    .get();

  const links = snap.docs.map((d) => {
    const data = d.data();
    return {
      token: d.id,
      siteName: data.siteName as string,
      createdByName: data.createdByName as string,
      createdAt: (data.createdAt as admin.firestore.Timestamp).toMillis(),
      expiresAt: (data.expiresAt as admin.firestore.Timestamp).toMillis(),
      durationMinutes: data.durationMinutes as number,
      revoked: data.revoked === true,
    };
  });

  return { links };
});

export const revokeTempClockLink = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }
  const callerRole = request.auth.token.role as string | undefined;
  const callerCompanyId = request.auth.token.companyId as string | undefined;
  if ((callerRole !== "admin" && callerRole !== "owner") || !callerCompanyId) {
    throw new HttpsError("permission-denied", "Not authorized.");
  }

  const token = (request.data?.token ? String(request.data.token) : "").trim();
  if (!token) {
    throw new HttpsError("invalid-argument", "token is required.");
  }

  const linkRef = db.collection("tempClockLinks").doc(token);
  const linkSnap = await linkRef.get();
  if (!linkSnap.exists || linkSnap.data()?.companyId !== callerCompanyId) {
    throw new HttpsError("not-found", "Link not found.");
  }
  await linkRef.update({ revoked: true });
  return { success: true };
});

// Public, read-only, no PIN involved - lets the redeem page render its
// "Orbitsworks / {company} / Clock In" branding and a friendly expired/
// revoked state before anyone touches the PIN pad. Deliberately separate
// from redeemTempClockLink so just loading the page never counts against
// that endpoint's PIN-attempt rate limit.
export const getTempClockLinkInfo = onCall(async (request) => {
  const token = (request.data?.token ? String(request.data.token) : "").trim();
  if (!token) {
    throw new HttpsError("invalid-argument", "Missing link token.");
  }

  const linkSnap = await db.collection("tempClockLinks").doc(token).get();
  if (!linkSnap.exists) {
    return { valid: false };
  }
  const link = linkSnap.data() as {
    companyId: string;
    siteName: string;
    expiresAt: admin.firestore.Timestamp;
    revoked?: boolean;
  };

  if (link.revoked || link.expiresAt.toMillis() < Date.now()) {
    return { valid: false };
  }

  const companySnap = await db.collection("companies").doc(link.companyId).get();
  const companyName = (companySnap.data()?.name as string) ?? "";

  return {
    valid: true,
    companyName,
    siteName: link.siteName,
    expiresAt: link.expiresAt.toMillis(),
  };
});

// Public - deliberately has no request.auth check. This is the only path
// in the whole backend a signed-out caller can reach, so every trust
// decision here has to be re-derived from the token itself rather than
// from a custom claim: token existence/expiry/revocation gates the call
// at all, then the PIN (checked server-side, unlike the kiosk's on-device
// hash match, since a public page has no trusted local PIN cache to check
// against) identifies which employee is clocking in/out.
export const redeemTempClockLink = onCall(async (request) => {
  const token = (request.data?.token ? String(request.data.token) : "").trim();
  const pin = (request.data?.pin ? String(request.data.pin) : "").trim();
  const photoBase64 = request.data?.photo ? String(request.data.photo) : "";
  const location = parseLocation(request.data);
  const locationAccuracyM = location ? parseAccuracy(request.data?.accuracy) : null;
  const reason = (request.data?.reason ? String(request.data.reason) : "").trim();

  if (!token) {
    throw new HttpsError("invalid-argument", "Missing link token.");
  }
  if (!/^\d{4}$/.test(pin)) {
    throw new HttpsError("invalid-argument", "PIN must be 4 digits.");
  }
  if (!photoBase64) {
    throw new HttpsError("invalid-argument", "A photo is required.");
  }

  const linkRef = db.collection("tempClockLinks").doc(token);
  const linkSnap = await linkRef.get();
  if (!linkSnap.exists) {
    throw new HttpsError("not-found", "This link is invalid.");
  }
  const link = linkSnap.data() as {
    companyId: string;
    siteId: string | null;
    siteName: string;
    createdByUid: string;
    createdByName: string;
    expiresAt: admin.firestore.Timestamp;
    revoked?: boolean;
    wrongAttemptCount?: number;
  };

  if (link.revoked) {
    throw new HttpsError("failed-precondition", "This link has been revoked.");
  }
  if (link.expiresAt.toMillis() < Date.now()) {
    throw new HttpsError("failed-precondition", "This link has expired.");
  }

  // Rolling 60s rate limit, same shape as pins.ts's verifyPin, keyed by
  // token instead of uid since there's no signed-in caller here.
  const attemptRef = db.collection("tempLinkAttempts").doc(token);
  const now = Date.now();
  const windowMs = 60 * 1000;
  const maxAttemptsPerWindow = 6;
  const attemptSnap = await attemptRef.get();
  let count = 0;
  let windowStart = now;
  if (attemptSnap.exists) {
    const data = attemptSnap.data() as { count?: number; windowStart?: number };
    if (data.windowStart && now - data.windowStart < windowMs) {
      count = data.count || 0;
      windowStart = data.windowStart;
    }
  }
  if (count >= maxAttemptsPerWindow) {
    const retryAfterSeconds = Math.ceil((windowStart + windowMs - now) / 1000);
    throw new HttpsError(
      "resource-exhausted",
      "Too many attempts. Try again in " + retryAfterSeconds + " seconds."
    );
  }
  await attemptRef.set({ count: count + 1, windowStart });

  const employeesRef = db.collection("companies").doc(link.companyId).collection("employees");
  const employeeSnap = await employeesRef
    .where("pin", "==", pin)
    .where("active", "==", true)
    .limit(1)
    .get();

  if (employeeSnap.empty) {
    // A 4-digit PIN is only 10,000 combinations, and this token is
    // reachable by anyone with the link - the per-minute rate limit alone
    // isn't enough over a full 60-minute link lifetime, so this also caps
    // total wrong guesses and kills the link outright past that cap.
    const wrongAttemptCount = (link.wrongAttemptCount ?? 0) + 1;
    const update: Record<string, unknown> = { wrongAttemptCount };
    if (wrongAttemptCount >= 15) update.revoked = true;
    await linkRef.update(update);
    throw new HttpsError("not-found", "PIN not recognized.");
  }

  await attemptRef.delete();

  const employeeDoc = employeeSnap.docs[0];
  const employee = employeeDoc.data() as {
    name?: string;
    lastEventType?: string;
    subcontractorId?: string | null;
    subcontractorName?: string | null;
  };

  const currentStatus = deriveStatus(employee.lastEventType);
  const nextType: "in" | "out" = currentStatus === "out" ? "in" : "out";

  // Geofencing (Pro) Part 3 - authoritative, synchronous enforcement.
  // Unlike the mobile app's offline queue, this callable always runs
  // online with a real server round trip available, so Block mode can be
  // genuinely denied here (not just labeled after the fact) - see the
  // Part 3 plan for why that guarantee doesn't extend to mobile's offline
  // path. Clock-outs are never gated, per spec - only "in" is checked.
  // The classification computed here is discarded rather than saved
  // directly; onClockEventCreated recomputes and saves it uniformly for
  // every entry point (mobile included), so there's exactly one writer
  // of geofenceStatus.
  if (nextType === "in" && link.siteId) {
    const [siteSnap, companySnap] = await Promise.all([
      db.collection("companies").doc(link.companyId).collection("jobSites").doc(link.siteId).get(),
      db.collection("companies").doc(link.companyId).get(),
    ]);
    const planTier = companySnap.data()?.planTier as string | undefined;

    if (isProPlan(planTier)) {
      const site = siteSnap.data() as
        | { lat?: number; lng?: number; radiusMeters?: number; requireGeofence?: boolean }
        | undefined;
      const classification = classifyGeofence(location, locationAccuracyM, site);

      if (classification.applicable && classification.status === "outside") {
        const mode =
          (companySnap.data()?.geofencing?.enforcementMode as EnforcementMode | undefined) ?? "flag";
        const hasReason = reason.length >= OVERRIDE_REASON_MIN_LENGTH && reason.length <= OVERRIDE_REASON_MAX_LENGTH;
        const result = evaluateEnforcement({
          distanceM: classification.distanceM,
          mode,
          siteName: link.siteName,
          hasReason,
        });

        if (!result.allowed) {
          if (mode === "block") {
            // employeeName in details - the page's declined step shows who
            // was denied, same as the mobile app's ClockDeclinedScreen.
            throw new HttpsError(
              "permission-denied",
              `${result.denialMessage} Ask your supervisor to clock you in.`,
              { employeeName: employee.name ?? "" }
            );
          }
          // requireReason, no valid reason yet - the page turns this into
          // a reason-entry step and resubmits with the reason included.
          throw new HttpsError(
            "failed-precondition",
            result.denialMessage ?? "A reason is required to clock in from this location."
          );
        }
      }
    }
  }

  const photoUrl = await uploadTempLinkPhoto(link.companyId, employeeDoc.id, photoBase64);

  const eventsRef = db.collection("companies").doc(link.companyId).collection("clockEvents");
  const nowTs = admin.firestore.Timestamp.now();
  const base = {
    employeeId: employeeDoc.id,
    employeeName: employee.name ?? "",
    siteId: link.siteId,
    siteName: link.siteName,
    subcontractorId: employee.subcontractorId ?? null,
    subcontractorName: employee.subcontractorName ?? null,
    source: "tempLink" as const,
    authorizedById: link.createdByUid,
    authorizedByName: link.createdByName,
    createdByUid: link.createdByUid,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    location,
    locationAccuracyM,
    reason: reason || null,
  };

  const batch = db.batch();
  // Mirrors clockQueue.js's queueClockEvent: clocking out while on break
  // auto-closes the break first, so a temp-link clock-out behaves exactly
  // like the kiosk's would for the same employee. Same location on both -
  // they're the same physical moment/device.
  if (currentStatus === "break" && nextType === "out") {
    batch.set(eventsRef.doc(), {
      ...base,
      type: "breakEnd",
      photoUrl: null,
      timestamp: admin.firestore.Timestamp.fromMillis(nowTs.toMillis() - 1),
    });
  }
  batch.set(eventsRef.doc(), {
    ...base,
    type: nextType,
    photoUrl,
    timestamp: nowTs,
  });
  await batch.commit();

  return {
    employeeName: employee.name ?? "",
    type: nextType,
    siteName: link.siteName,
  };
});
