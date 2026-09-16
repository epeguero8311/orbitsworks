import { Resend } from "resend";
import { defineSecret } from "firebase-functions/params";

// Bind this secret into the `secrets` array of any function that uses
// `resend`, e.g. `onCall({ secrets: [RESEND_API_KEY] }, ...)`.
export const RESEND_API_KEY = defineSecret("RESEND_API_KEY");

// Lazily initialized so importing this module never throws before the
// function's secret binding has resolved the env var - mirrors
// lib/stripe/server.ts's Stripe proxy.
let _resend: Resend | null = null;

function getResendClient(): Resend {
  if (_resend) return _resend;
  const apiKey = RESEND_API_KEY.value();
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not set in the environment.");
  }
  _resend = new Resend(apiKey);
  return _resend;
}

// Real client (and the secret-value check) is only created on first actual
// property access at request time, never at module load time.
export const resend: Resend = new Proxy({} as Resend, {
  get(_target, prop, receiver) {
    const client = getResendClient();
    const value = Reflect.get(client as object, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
