import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";
import { parseJoinInfo } from "./validators/joinSignup";

// The public sign-up calls. None needs (or sends) a login.
// Never log what goes in or comes out: the token, password, birthday,
// selfie and PIN all pass through here.
//
// kind "qr" = crew code (getJoinInfo / joinCompany); kind "invite" = email
// invite (getInviteInfo / acceptEmployeeInvite, Phase 3B). Both pairs take
// the same input and answer the same shape, so the screens are one flow.

const INFO_TIMEOUT = 20000;
// The sign-up creates the account, saves the selfie and reserves a PIN in
// one go, so it gets longer.
const SUBMIT_TIMEOUT = 60000;
const CALLS = {
  qr: {
    info: httpsCallable(functions, "getJoinInfo", { timeout: INFO_TIMEOUT }),
    submit: httpsCallable(functions, "joinCompany", { timeout: SUBMIT_TIMEOUT }),
  },
  invite: {
    info: httpsCallable(functions, "getInviteInfo", { timeout: INFO_TIMEOUT }),
    submit: httpsCallable(functions, "acceptEmployeeInvite", { timeout: SUBMIT_TIMEOUT }),
  },
};
const callsFor = (kind) => (kind === "invite" ? CALLS.invite : CALLS.qr);

// Resolves { status: "active", ... } or { status: "inactive" }. Throws on a
// network or server error (the caller shows Retry for that).
export async function fetchJoinInfo(token, kind = "qr") {
  const res = await callsFor(kind).info({ token });
  const parsed = parseJoinInfo(res.data);
  if (!parsed) throw new Error("Unexpected join info response");
  return parsed;
}

// Resolves { pin, companyName }. Throws the callable error as-is (its
// details.reason is mapped by mapJoinError).
export async function submitJoin(payload, kind = "qr") {
  const res = await callsFor(kind).submit(payload);
  const data = res.data || {};
  if (typeof data.pin !== "string") throw new Error("Unexpected join response");
  return { pin: data.pin, companyName: typeof data.companyName === "string" ? data.companyName : "" };
}
