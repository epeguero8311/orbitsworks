// Read-only sync-speed report for one company's mobile clock events.
//
// For each recent "pin" clock event with a photo, compares three times:
//   tap         - createdAt (set on the phone when the employee tapped)
//   photo done  - the Storage object's timeCreated (upload finished)
//   on server   - the Firestore doc's createTime
// The photo's filename is Date.now() at upload start, which gives the
// upload duration and the time the event spent waiting in the queue.
//
// Uses your gcloud login (gcloud auth print-access-token). Never writes.
//
// Usage:
//   node scripts/measure-sync-timing.mjs <companyId> [--project orbitworks-7ef59] [--since 2026-10-29T14:00:00Z] [--limit 60]

import { execSync } from "node:child_process";

const args = process.argv.slice(2);
const companyId = args[0] && !args[0].startsWith("--") ? args[0] : null;
function flag(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
}
const project = flag("project", "orbitworks-7ef59");
const since = flag("since", null);
const limit = Number(flag("limit", "60"));

if (!companyId) {
  console.error("Usage: node scripts/measure-sync-timing.mjs <companyId> [--project id] [--since ISO] [--limit n]");
  process.exit(1);
}

const token = execSync("gcloud auth print-access-token", { encoding: "utf8" }).trim();
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
const bucket = `${project}.firebasestorage.app`;

const query = {
  structuredQuery: {
    from: [{ collectionId: "clockEvents" }],
    orderBy: [{ field: { fieldPath: "createdAt" }, direction: "DESCENDING" }],
    limit,
    ...(since
      ? {
          where: {
            fieldFilter: {
              field: { fieldPath: "createdAt" },
              op: "GREATER_THAN_OR_EQUAL",
              value: { timestampValue: new Date(since).toISOString() },
            },
          },
        }
      : {}),
  },
};

const res = await fetch(
  `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/companies/${companyId}:runQuery`,
  { method: "POST", headers, body: JSON.stringify(query) }
);
if (!res.ok) {
  console.error("Firestore query failed:", res.status, await res.text());
  process.exit(1);
}
const docs = (await res.json()).filter((r) => r.document).map((r) => r.document);

const rows = [];
for (const d of docs) {
  const f = d.fields;
  if (f.source?.stringValue !== "pin") continue;
  const tap = Date.parse(f.createdAt?.timestampValue);
  const onServer = Date.parse(d.createTime);
  const row = {
    tap: new Date(tap).toISOString().slice(0, 19),
    type: f.type?.stringValue,
    device: (f.deviceNameSnapshot?.stringValue || f.deviceId?.stringValue || "-").slice(0, 18),
    tapToServerS: +((onServer - tap) / 1000).toFixed(1),
    queueWaitS: null,
    uploadS: null,
    KB: null,
    KBps: null,
    photoPending: f.photoPending?.booleanValue ?? null,
    employee: (f.employeeName?.stringValue || "-").slice(0, 16),
    face: f.faceCheck?.mapValue?.fields?.status?.stringValue || "",
    similarity: (() => {
      const s = f.faceCheck?.mapValue?.fields?.similarity;
      return s?.doubleValue ?? (s?.integerValue != null ? Number(s.integerValue) : null);
    })(),
  };
  const url = f.photoUrl?.stringValue;
  if (url) {
    const path = decodeURIComponent(url.split("/o/")[1].split("?")[0]);
    const startMatch = path.match(/(\d{13})\.jpg$/);
    const meta = await fetch(
      `https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(path)}?fields=size,timeCreated`,
      { headers }
    ).then((r) => (r.ok ? r.json() : null));
    if (meta) {
      const done = Date.parse(meta.timeCreated);
      row.KB = Math.round(Number(meta.size) / 1024);
      if (startMatch) {
        const start = Number(startMatch[1]);
        row.queueWaitS = +((start - tap) / 1000).toFixed(1);
        row.uploadS = +((done - start) / 1000).toFixed(1);
        row.KBps = row.uploadS > 0 ? Math.round(row.KB / row.uploadS) : null;
      }
    }
  }
  rows.push(row);
}

console.table(rows);

const median = (xs) => {
  const s = xs.filter((x) => x != null).sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};
const max = (xs) => Math.max(...xs.filter((x) => x != null));
console.log({
  events: rows.length,
  tapToServerMedianS: median(rows.map((r) => r.tapToServerS)),
  tapToServerMaxS: rows.length ? max(rows.map((r) => r.tapToServerS)) : null,
  uploadMedianS: median(rows.map((r) => r.uploadS)),
  photoMedianKB: median(rows.map((r) => r.KB)),
});
