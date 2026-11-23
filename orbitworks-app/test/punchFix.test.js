const test = require("node:test");
const assert = require("node:assert/strict");
const { startPunchFixWith } = require("../lib/punchFixLogic");

const NOW = Date.now();
const position = (timestamp, accuracy = 12) => ({ coords: { latitude: 29.95, longitude: -90.07, accuracy }, timestamp });

function fakeLocation({ current, last } = {}) {
  const calls = { request: 0 };
  return {
    calls,
    Accuracy: { Balanced: 3 },
    getCurrentPositionAsync: async () => (typeof current === "function" ? current() : current),
    getLastKnownPositionAsync: async () => (typeof last === "function" ? last() : last),
    requestForegroundPermissionsAsync: async () => {
      calls.request++;
      return { status: "granted" };
    },
  };
}

const granted = async () => ({ status: "granted" });

test("fresh fix ready -> used", async () => {
  const L = fakeLocation({ current: position(NOW - 1000), last: position(NOW - 30000) });
  const fix = startPunchFixWith({ loadLocation: () => L, getStatus: granted });
  await fix.done;
  assert.equal(fix.take(NOW).fixAtMs, NOW - 1000);
});

test("no fresh fix -> last known within 2 min", async () => {
  const L = fakeLocation({ current: () => new Promise(() => {}), last: position(NOW - 60000) });
  const fix = startPunchFixWith({ loadLocation: () => L, getStatus: granted, timeoutMs: 20 });
  await fix.done;
  assert.equal(fix.take(NOW).fixAtMs, NOW - 60000);
});

test("last known too old, no fresh fix -> null", async () => {
  const L = fakeLocation({ current: null, last: position(NOW - 3 * 60000) });
  const fix = startPunchFixWith({ loadLocation: () => L, getStatus: granted });
  await fix.done;
  assert.equal(fix.take(NOW), null);
});

test("take never waits: before anything is ready it returns null at once", () => {
  const L = fakeLocation({ current: () => new Promise(() => {}), last: () => new Promise(() => {}) });
  const fix = startPunchFixWith({ loadLocation: () => L, getStatus: granted, timeoutMs: 10 });
  assert.equal(fix.take(NOW), null);
});

test("timeout -> null, and the late answer never throws", async () => {
  const L = fakeLocation({
    current: () => new Promise((_, reject) => setTimeout(() => reject(new Error("late")), 30)),
    last: null,
  });
  const fix = startPunchFixWith({ loadLocation: () => L, getStatus: granted, timeoutMs: 5 });
  await fix.done;
  assert.equal(fix.take(NOW), null);
  await new Promise((r) => setTimeout(r, 50));
});

test("no permission -> null, and it never asks", async () => {
  for (const status of ["denied", "undetermined"]) {
    const L = fakeLocation({ current: position(NOW), last: position(NOW) });
    const fix = startPunchFixWith({ loadLocation: () => L, getStatus: async () => ({ status }) });
    await fix.done;
    assert.equal(fix.take(NOW), null);
    assert.equal(L.calls.request, 0);
  }
});

test("never throws: broken module, failing status, failing calls", async () => {
  const cases = [
    { loadLocation: () => { throw new Error("no native module"); }, getStatus: granted },
    { loadLocation: () => fakeLocation(), getStatus: async () => { throw new Error("status"); } },
    { loadLocation: () => fakeLocation({ current: () => Promise.reject(new Error("gps")), last: () => Promise.reject(new Error("x")) }), getStatus: granted },
    { loadLocation: () => fakeLocation(), getStatus: async () => null },
  ];
  for (const deps of cases) {
    const fix = startPunchFixWith(deps);
    await fix.done;
    assert.equal(fix.take(NOW), null);
  }
});

test("a bad position from the phone -> null", async () => {
  const L = fakeLocation({ current: { coords: { latitude: 200, longitude: 0 }, timestamp: NOW }, last: null });
  const fix = startPunchFixWith({ loadLocation: () => L, getStatus: granted });
  await fix.done;
  assert.equal(fix.take(NOW), null);
});
