import { z } from "zod";
import {
  feetToMeters,
  milesToMeters,
  MIN_GEOFENCE_RADIUS_METERS,
  MAX_GEOFENCE_RADIUS_METERS,
} from "@/lib/geo";

// Backs the Sites Add/Edit form (SitesSection.tsx). Geofence fields are
// only required/checked when requireGeofence is true - matches the
// "toggle off = current behavior" rule from the Geofencing spec.
export const jobSiteSchema = z
  .object({
    name: z.string().trim().min(1, "Site name is required").max(120),
    address: z.string().trim().max(200).optional(),
    requireGeofence: z.boolean(),
    radiusValue: z.number().positive("Radius is required"),
    radiusUnit: z.enum(["ft", "mi"]),
  })
  .superRefine((data, ctx) => {
    if (!data.requireGeofence) return;

    if (!data.address) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["address"],
        message: "Address is required when geofencing is on",
      });
    }

    const radiusMeters =
      data.radiusUnit === "mi" ? milesToMeters(data.radiusValue) : feetToMeters(data.radiusValue);
    if (radiusMeters < MIN_GEOFENCE_RADIUS_METERS || radiusMeters > MAX_GEOFENCE_RADIUS_METERS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["radiusValue"],
        message: "Radius must be between 100 ft and 5 mi",
      });
    }
  });

export type JobSiteInput = z.infer<typeof jobSiteSchema>;
