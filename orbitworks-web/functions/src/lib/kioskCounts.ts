// Task 5 (K8): kiosk records (shared tablets) never count toward the active
// or total employee caps. onEmployeeWrite keeps the company's counters
// without them; the join / invite flows that count live with
// where("active", "==", true).count() subtract them with this.
import type * as admin from "firebase-admin";

export function kioskRecordsQuery(employeesRef: admin.firestore.CollectionReference) {
  return employeesRef.where("kiosk", "==", true);
}

export function withoutKiosks(
  counts: { active: number; total: number },
  kioskSnap: admin.firestore.QuerySnapshot | null | undefined
): { active: number; total: number } {
  if (!kioskSnap || kioskSnap.empty) return counts;
  const activeKiosks = kioskSnap.docs.filter((d) => d.get("active") === true).length;
  return {
    active: Math.max(0, counts.active - activeKiosks),
    total: Math.max(0, counts.total - kioskSnap.size),
  };
}
