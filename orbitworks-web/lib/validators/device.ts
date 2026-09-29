import { z } from "zod";

export const DEVICE_NAME_MIN_LENGTH = 1;
export const DEVICE_NAME_MAX_LENGTH = 24;

export const deviceNameSchema = z
  .string()
  .trim()
  .min(DEVICE_NAME_MIN_LENGTH, "Device name is required")
  .max(DEVICE_NAME_MAX_LENGTH, `Device name must be ${DEVICE_NAME_MAX_LENGTH} characters or fewer`);

export const deviceRenameSchema = z.object({
  name: deviceNameSchema,
});

export type DeviceRenameInput = z.infer<typeof deviceRenameSchema>;
