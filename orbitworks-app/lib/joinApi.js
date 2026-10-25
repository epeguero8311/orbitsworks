import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";
import { parseJoinInfo } from "./validators/joinSignup";

// The two public sign-up calls. Neither needs (or sends) a login.
// Never log what goes in or comes out: the token, password, birthday,
// selfie and PIN all pass through here.

const getJoinInfoFn = httpsCallable(functions, "getJoinInfo", { timeout: 20000 });
// joinCompany creates the account, saves the selfie and reserves a PIN in
// one go, so it gets longer.
const joinCompanyFn = httpsCallable(functions, "joinCompany", { timeout: 60000 });

// Resolves { status: "active", ... } or { status: "inactive" }. Throws on a
// network or server error (the caller shows Retry for that).
export async function fetchJoinInfo(token) {
  const res = await getJoinInfoFn({ token });
  const parsed = parseJoinInfo(res.data);
  if (!parsed) throw new Error("Unexpected join info response");
  return parsed;
}

// Resolves { pin, companyName }. Throws the callable error as-is (its
// details.reason is mapped by mapJoinError).
export async function submitJoin(payload) {
  const res = await joinCompanyFn(payload);
  const data = res.data || {};
  if (typeof data.pin !== "string") throw new Error("Unexpected join response");
  return { pin: data.pin, companyName: typeof data.companyName === "string" ? data.companyName : "" };
}
