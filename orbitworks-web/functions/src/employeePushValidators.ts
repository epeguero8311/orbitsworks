import { z } from "zod";
import { EXPO_PUSH_TOKEN_PATTERN } from "./pushTokens";

// ---- Employee App Phase 7: push token calls ----
//
// registerEmployeePushToken: the token this phone got from Expo. The
// employee comes from the login's claims, never from the input.
// clearEmployeePushToken: the same token, so signing out on an old phone
// never removes the token of the phone the employee uses now.

const expoTokenField = z.string().max(256).regex(EXPO_PUSH_TOKEN_PATTERN, "Invalid push token");

export const registerEmployeePushTokenSchema = z
  .object({
    token: expoTokenField,
    platform: z.enum(["ios", "android"]),
  })
  .strict();

export const clearEmployeePushTokenSchema = z
  .object({
    token: expoTokenField,
  })
  .strict();

export type RegisterEmployeePushTokenInput = z.infer<typeof registerEmployeePushTokenSchema>;
export type ClearEmployeePushTokenInput = z.infer<typeof clearEmployeePushTokenSchema>;
