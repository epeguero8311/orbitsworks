// PIN pad sizing (lib/pinPadLayout.js). Run: node --test test/pinPadLayout.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const { pinPadMetrics, KEY_LETTERS, MIN_KEY, MAX_KEY } = require("../lib/pinPadLayout");

const gridWidth = (m) => 3 * m.key + 2 * m.gapX;
const gridHeight = (m) => 4 * m.key + 3 * m.gapY;

test("normal iPhone keys are roughly 75-85pt", () => {
  for (const w of [375, 390, 393]) {
    const { key } = pinPadMetrics(w);
    assert.ok(key >= 75 && key <= 85, `${w}pt wide -> ${key}`);
  }
});

test("keys scale down on small phones and up on big ones", () => {
  const small = pinPadMetrics(320).key;
  const normal = pinPadMetrics(390).key;
  const big = pinPadMetrics(430).key;
  assert.ok(small < normal && normal < big, `${small} < ${normal} < ${big}`);
});

test("the grid never overflows the width", () => {
  for (const w of [320, 360, 375, 390, 414, 430, 768, 1024]) {
    const m = pinPadMetrics(w);
    assert.ok(gridWidth(m) <= w - 32, `${w}pt wide -> grid ${gridWidth(m)}`);
    assert.ok(m.key <= MAX_KEY);
  }
});

test("keys shrink to fit a short space", () => {
  const m = pinPadMetrics(390, 300);
  assert.ok(gridHeight(m) <= 300, `grid ${gridHeight(m)}`);
  assert.ok(m.key < pinPadMetrics(390).key);
});

test("keys never drop below the minimum tap size", () => {
  assert.equal(pinPadMetrics(390, 100).key, MIN_KEY);
  assert.ok(MIN_KEY >= 44);
});

test("letters under 2-9 only, like the iPhone", () => {
  assert.deepEqual(Object.keys(KEY_LETTERS), ["2", "3", "4", "5", "6", "7", "8", "9"]);
  assert.equal(KEY_LETTERS[7], "PQRS");
  assert.equal(KEY_LETTERS[9], "WXYZ");
});
