// Employee App - the Settings tab's saved PIN (lib/savedPinStore.js,
// 2026-11-11): a failed fetch never drops a good saved PIN, calls at the
// same time share one getMyPin, Settings fetches once when nothing is
// saved, and a new joiner's PIN is saved from the sign-up answer.
// Run: node --test test/savedPinStore.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const { createSavedPinStore } = require("../lib/savedPinStore");
const { PIN_LOADING, PIN_NOT_LOADED, savedPinText } = require("../lib/savedPin");

const C = "co1";
const E = "emp1";
// A fake check hash: "matches" when the PIN is the one it was made from.
const hashFor = (pin) => ({ status: "ok", salt: "s", hash: pin });

// fetchPlan: list of what each getMyPin call does, in order:
//   { pin } = answers ok after `ms`;  "fail" = throws after `ms`
function fakePhone({ saved = null, fetchPlan = [] } = {}) {
  const items = new Map();
  if (saved) items.set(`myPin.${C}.${E}`, JSON.stringify(saved));
  const state = { items, fetches: 0, changes: 0 };
  const store = createSavedPinStore({
    readItem: async (key) => (items.has(key) ? items.get(key) : null),
    writeItem: async (key, value) => {
      if (value === null) items.delete(key);
      else items.set(key, value);
    },
    fetchPin: async () => {
      const step = fetchPlan[state.fetches] ?? { pin: "1234" };
      state.fetches++;
      await new Promise((r) => setTimeout(r, step.ms ?? 0));
      if (step.fail) throw new Error("timeout");
      return { status: "ok", pin: step.pin };
    },
    matches: async (pin, verifier) => pin === verifier.hash,
  });
  store.onChange(() => state.changes++);
  return { store, state, saved: () => store.read(C, E) };
}

test("nothing saved: one getMyPin, its answer is saved", async () => {
  const p = fakePhone();
  await p.store.syncAfterVerifier(C, E, hashFor("1234"));
  assert.deepEqual(await p.saved(), { status: "ok", pin: "1234" });
  assert.equal(p.state.fetches, 1);
});

test("a saved PIN that matches the fresh hash is kept, no getMyPin", async () => {
  const p = fakePhone({ saved: { status: "ok", pin: "1234" } });
  await p.store.syncAfterVerifier(C, E, hashFor("1234"));
  assert.equal(p.state.fetches, 0);
  assert.deepEqual(await p.saved(), { status: "ok", pin: "1234" });
});

test("a failed fetch keeps a saved PIN that matches (saved by another call while it waited)", async () => {
  const p = fakePhone({ fetchPlan: [{ fail: true, ms: 40 }] });
  const run = p.store.syncAfterVerifier(C, E, hashFor("1234"));
  // While this call's getMyPin is still waiting, another call saves the PIN.
  await new Promise((r) => setTimeout(r, 5));
  p.state.items.set(`myPin.${C}.${E}`, JSON.stringify({ status: "ok", pin: "1234" }));
  await run;
  assert.deepEqual(await p.saved(), { status: "ok", pin: "1234" });
});

test("a failed fetch, then a later one that works: the PIN is saved", async () => {
  const p = fakePhone({ fetchPlan: [{ fail: true, ms: 10 }, { pin: "1234" }] });
  await p.store.syncAfterVerifier(C, E, hashFor("1234"));
  assert.equal(await p.saved(), null);
  await p.store.syncAfterVerifier(C, E, hashFor("1234"));
  assert.deepEqual(await p.saved(), { status: "ok", pin: "1234" });
});

test("a failed fetch removes a saved PIN that is wrong for the current hash", async () => {
  const p = fakePhone({ saved: { status: "ok", pin: "9999" }, fetchPlan: [{ fail: true }] });
  await p.store.syncAfterVerifier(C, E, hashFor("1234"));
  assert.equal(await p.saved(), null);
});

test("PIN changed on the website: the stale saved PIN is replaced", async () => {
  const p = fakePhone({ saved: { status: "ok", pin: "9999" }, fetchPlan: [{ pin: "1234" }] });
  await p.store.syncAfterVerifier(C, E, hashFor("1234"));
  assert.deepEqual(await p.saved(), { status: "ok", pin: "1234" });
});

test("calls at the same time share one getMyPin request", async () => {
  const p = fakePhone({ fetchPlan: [{ pin: "1234", ms: 30 }] });
  await Promise.all([
    p.store.syncAfterVerifier(C, E, hashFor("1234")),
    p.store.syncAfterVerifier(C, E, hashFor("1234")),
    p.store.syncAfterVerifier(C, E, hashFor("1234")),
  ]);
  assert.equal(p.state.fetches, 1);
  assert.deepEqual(await p.saved(), { status: "ok", pin: "1234" });
});

test("parallel calls whose shared request fails leave nothing broken, and a later call fetches again", async () => {
  const p = fakePhone({ fetchPlan: [{ fail: true, ms: 20 }, { pin: "1234" }] });
  await Promise.all([p.store.syncAfterVerifier(C, E, hashFor("1234")), p.store.syncAfterVerifier(C, E, hashFor("1234"))]);
  assert.equal(p.state.fetches, 1);
  assert.equal(await p.saved(), null);
  await p.store.syncAfterVerifier(C, E, hashFor("1234"));
  assert.equal(p.state.fetches, 2);
  assert.deepEqual(await p.saved(), { status: "ok", pin: "1234" });
});

test("noPin / inactive from the hash are saved without getMyPin", async () => {
  const p = fakePhone({ saved: { status: "ok", pin: "1234" } });
  await p.store.syncAfterVerifier(C, E, { status: "inactive" });
  assert.deepEqual(await p.saved(), { status: "inactive" });
  await p.store.syncAfterVerifier(C, E, { status: "noPin" });
  assert.deepEqual(await p.saved(), { status: "noPin" });
  assert.equal(p.state.fetches, 0);
});

test("retry (Settings): nothing saved -> refresh runs and ensureSaved waits for the save", async () => {
  const p = fakePhone({ fetchPlan: [{ pin: "1234", ms: 30 }] });
  let refreshes = 0;
  const refresh = async () => {
    refreshes++;
    // Like refreshPinVerifier: starts the save without waiting for it.
    p.store.syncAfterVerifier(C, E, hashFor("1234"));
    return true;
  };
  await p.store.ensureSaved(C, E, refresh);
  assert.equal(refreshes, 1);
  assert.deepEqual(await p.saved(), { status: "ok", pin: "1234" });
});

test("retry (Settings): something already saved -> no refresh", async () => {
  const p = fakePhone({ saved: { status: "ok", pin: "1234" } });
  let refreshes = 0;
  await p.store.ensureSaved(C, E, async () => refreshes++);
  assert.equal(refreshes, 0);
});

test("retry (Settings): refresh fails (offline) -> resolves, nothing saved", async () => {
  const p = fakePhone();
  await p.store.ensureSaved(C, E, async () => {
    throw new Error("offline");
  });
  assert.equal(await p.saved(), null);
});

test("join: the PIN from sign-up is saved on the first hash, no getMyPin", async () => {
  const p = fakePhone();
  p.store.rememberJoinedPin("4321");
  await p.store.syncAfterVerifier(C, E, hashFor("4321"));
  assert.deepEqual(await p.saved(), { status: "ok", pin: "4321" });
  assert.equal(p.state.fetches, 0);
});

test("join: a sign-up PIN that doesn't match the hash is dropped and getMyPin is used", async () => {
  const p = fakePhone({ fetchPlan: [{ pin: "1234" }] });
  p.store.rememberJoinedPin("4321");
  await p.store.syncAfterVerifier(C, E, hashFor("1234"));
  assert.deepEqual(await p.saved(), { status: "ok", pin: "1234" });
  assert.equal(p.state.fetches, 1);
  // Used once: a later sync never sees it again.
  p.state.items.clear();
  await p.store.syncAfterVerifier(C, E, hashFor("4321"));
  assert.equal(p.state.fetches, 2);
});

test("join: anything that isn't 4 digits is ignored", async () => {
  const p = fakePhone();
  p.store.rememberJoinedPin("12a4");
  await p.store.syncAfterVerifier(C, E, hashFor("12a4"));
  assert.equal(p.state.fetches, 1);
});

test("log out: the saved PIN and a remembered sign-up PIN are removed", async () => {
  const p = fakePhone({ saved: { status: "ok", pin: "1234" } });
  p.store.rememberJoinedPin("4321");
  await p.store.forget(C, E);
  assert.equal(await p.saved(), null);
  await p.store.syncAfterVerifier(C, E, hashFor("4321"));
  assert.equal(p.state.fetches, 1);
});

test("Settings text: Loading while fetching, the old message otherwise", () => {
  assert.equal(savedPinText(null, { loading: true }), PIN_LOADING);
  assert.equal(savedPinText(null), PIN_NOT_LOADED);
  assert.equal(savedPinText({ status: "ok", pin: "1234" }, { loading: true }), "1234");
});
