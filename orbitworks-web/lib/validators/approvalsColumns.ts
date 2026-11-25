import { z } from "zod";
import { OPTIONAL_APPROVALS_COLUMNS, MAX_OPTIONAL_APPROVALS_COLUMNS } from "@/lib/approvalsColumns";

// Approve Hours Columns modal (Task 2): the company's `approvalsColumns`
// field - the OPTIONAL column keys only (Name + Status are always on and
// never stored), no duplicates, at most 6 (max 8 counting Name + Status).
// Checked on the client right before the modal saves. firestore.rules
// (validCompanyApprovalsColumns) checks the same, plus the Pro-only keys.
export const approvalsColumnsSchema = z
  .array(z.enum(OPTIONAL_APPROVALS_COLUMNS))
  .max(MAX_OPTIONAL_APPROVALS_COLUMNS, `You can show up to ${MAX_OPTIONAL_APPROVALS_COLUMNS + 2} columns.`)
  .refine((keys) => new Set(keys).size === keys.length, "Each column can only be picked once.");

export type ApprovalsColumnsInput = z.infer<typeof approvalsColumnsSchema>;
