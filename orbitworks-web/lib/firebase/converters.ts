import type {
  FirestoreDataConverter,
  QueryDocumentSnapshot,
  SnapshotOptions,
  WithFieldValue,
} from "firebase/firestore";
import type {
  Device,
  EmployeeAlert,
  EmployeeAppConfig,
  Invite,
  ShiftNote,
  Subcontractor,
} from "@/lib/types";

// Generic client-side Firestore converter factory. Entities are defined
// once in lib/types.ts as { id: string; ...fields }; toFirestore() strips
// "id" back out (Firestore stores it as the doc path, not a field) and
// fromFirestore() stamps it back on from the snapshot. Using this via
// .withConverter() instead of a raw `{ id: d.id, ...d.data() } as T` cast
// is new to this codebase - introduced for Device (Device Recognition Pro)
// rather than retrofitted onto existing entities/hooks.
function makeConverter<T extends { id: string }>(): FirestoreDataConverter<T> {
  return {
    toFirestore(value: WithFieldValue<T>) {
      const { id, ...rest } = value as T;
      return rest;
    },
    fromFirestore(snapshot: QueryDocumentSnapshot, options?: SnapshotOptions) {
      return { id: snapshot.id, ...snapshot.data(options) } as T;
    },
  };
}

export const deviceConverter = makeConverter<Device>();
export const inviteConverter = makeConverter<Invite>();
export const subcontractorConverter = makeConverter<Subcontractor>();
export const shiftNoteConverter = makeConverter<ShiftNote>();
export const employeeAlertConverter = makeConverter<EmployeeAlert>();
export const employeeAppConfigConverter = makeConverter<EmployeeAppConfig & { id: string }>();
