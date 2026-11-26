// Task 7 (tablet landscape) - lib/tabletLayout.js
const test = require("node:test");
const assert = require("node:assert/strict");

let t;
test.before(async () => {
  t = await import("../lib/tabletLayout.js");
});

test("grid only on a wide landscape window (tablet on its side)", () => {
  assert.deepEqual(t.layoutFor(1133, 744), { landscape: true, grid: true }); // iPad mini landscape
  assert.deepEqual(t.layoutFor(1366, 1024), { landscape: true, grid: true }); // 12.9" landscape
  assert.deepEqual(t.layoutFor(744, 1133), { landscape: false, grid: false }); // iPad mini portrait
  assert.deepEqual(t.layoutFor(1024, 1366), { landscape: false, grid: false });
  assert.equal(t.layoutFor(694, 1024).grid, false); // Split View half
  assert.equal(t.layoutFor(844, 390).grid, false); // a phone on its side (never happens: locked)
  assert.equal(t.layoutFor(0, 0).grid, false);
});

test("phones lock portrait; tablets, desktops and TVs don't; unknown locks", () => {
  const types = { UNKNOWN: 0, PHONE: 1, TABLET: 2, DESKTOP: 3, TV: 4 };
  assert.equal(t.shouldLockPortrait(types.PHONE, types), true);
  assert.equal(t.shouldLockPortrait(types.UNKNOWN, types), true);
  assert.equal(t.shouldLockPortrait(null, types), true);
  assert.equal(t.shouldLockPortrait(types.TABLET, types), false);
  assert.equal(t.shouldLockPortrait(types.DESKTOP, types), false);
  assert.equal(t.shouldLockPortrait(types.TV, types), false);
  assert.equal(t.shouldLockPortrait(types.TABLET, undefined), true);
});

test("gridRows: 2 per row, hidden cells dropped", () => {
  assert.deepEqual(t.gridRows(["a", "b", "c", "d"]), [["a", "b"], ["c", "d"]]);
  assert.deepEqual(t.gridRows(["a", null, "c"]), [["a", "c"]]);
  assert.deepEqual(t.gridRows(["a", "b", "c"]), [["a", "b"], ["c"]]);
  assert.deepEqual(t.gridRows([]), []);
});
