export type AuthErrorField = "email" | "password" | "credentials" | "none";

export interface AuthErrorResult {
  message: string;
  field: AuthErrorField;
}

const CODE_MESSAGES: Record<string, AuthErrorResult> = {
  "auth/invalid-credential": {
    message: "Incorrect email or password. Try again.",
    field: "credentials",
  },
  "auth/wrong-password": {
    message: "Incorrect email or password. Try again.",
    field: "credentials",
  },
  "auth/user-not-found": {
    message: "Incorrect email or password. Try again.",
    field: "credentials",
  },
  "auth/invalid-email": {
    message: "That email address doesn't look right.",
    field: "email",
  },
  "auth/email-already-in-use": {
    message: "An account with that email already exists.",
    field: "email",
  },
  "auth/weak-password": {
    message: "Password should be at least 6 characters.",
    field: "password",
  },
  "auth/user-disabled": {
    message: "This account has been disabled. Contact your admin.",
    field: "none",
  },
  "auth/too-many-requests": {
    message: "Too many attempts. Wait a bit and try again.",
    field: "none",
  },
  "auth/network-request-failed": {
    message: "Network error. Check your connection and try again.",
    field: "none",
  },
  "auth/popup-closed-by-user": {
    message: "Sign-in was cancelled.",
    field: "none",
  },
  "functions/not-found": {
    message: "No pending invite found for that email. Ask your admin to invite you first.",
    field: "email",
  },
};

export function getAuthErrorMessage(
  err: unknown,
  fallback = "Something went wrong. Try again."
): AuthErrorResult {
  const code = (err as { code?: string } | null | undefined)?.code;
  if (code && CODE_MESSAGES[code]) {
    return CODE_MESSAGES[code];
  }
  return { message: fallback, field: "none" };
}