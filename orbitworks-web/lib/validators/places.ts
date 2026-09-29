import { z } from "zod";

// Below 3 chars Google's predictions aren't meaningful yet - the client
// debounces and skips the call entirely, this is the server-side backstop.
export const placesAutocompleteRequestSchema = z.object({
  input: z.string().trim().min(3).max(200),
  sessionToken: z.string().trim().min(1).max(100),
});

export const placesDetailsRequestSchema = z.object({
  placeId: z.string().trim().min(1).max(300),
  sessionToken: z.string().trim().min(1).max(100),
});
