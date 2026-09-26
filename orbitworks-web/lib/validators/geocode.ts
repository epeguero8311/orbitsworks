import { z } from "zod";

export const reverseGeocodeRequestSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  eventId: z.string().trim().min(1),
});

export type ReverseGeocodeRequest = z.infer<typeof reverseGeocodeRequestSchema>;
