import { z } from "zod";

export const subcontractorSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  contactName: z.string().trim().max(120).optional(),
  email: z.string().trim().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().trim().max(30).optional(),
  address: z.string().trim().max(200).optional(),
  active: z.boolean(),
});

export type SubcontractorInput = z.infer<typeof subcontractorSchema>;

export const reassignSubcontractorSchema = z.object({
  employeeId: z.string().trim().min(1),
  newSubcontractorId: z.string().trim().min(1).nullable(),
  reason: z.string().trim().max(300).optional(),
});

export type ReassignSubcontractorInput = z.infer<typeof reassignSubcontractorSchema>;