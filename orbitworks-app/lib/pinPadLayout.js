// PIN pad sizing - key size from the screen width, shrunk if the space left
// for the grid is too short, so the 3x4 grid is big on every phone and never
// overflows. No React Native imports so test/pinPadLayout.test.js can run it
// under `node --test`.

const MIN_KEY = 56; // still well above the 44pt minimum tap target
const MAX_KEY = 92;
const SIDE_GUTTER = 16;
const GAP_X = 0.3; // gap between columns, as a share of the key size
const GAP_Y = 0.2; // gap between rows

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

// width: screen width. gridHeight: height available for the grid (optional,
// unknown until the first layout).
function pinPadMetrics(width, gridHeight) {
  let key = width * 0.21; // ~82 on a 390pt iPhone
  // 3 keys + 2 gaps must fit inside the side gutters.
  key = Math.min(key, (width - SIDE_GUTTER * 2) / (3 + 2 * GAP_X));
  // 4 rows + 3 gaps must fit in the height we have.
  if (gridHeight > 0) key = Math.min(key, gridHeight / (4 + 3 * GAP_Y));
  key = Math.floor(clamp(key, MIN_KEY, MAX_KEY));
  return {
    key,
    gapX: Math.round(key * GAP_X),
    gapY: Math.round(key * GAP_Y),
    digitSize: Math.round(key * 0.44),
    letterSize: Math.max(9, Math.round(key * 0.12)),
  };
}

// The small letters under 2-9, like the iPhone passcode pad.
const KEY_LETTERS = {
  2: "ABC",
  3: "DEF",
  4: "GHI",
  5: "JKL",
  6: "MNO",
  7: "PQRS",
  8: "TUV",
  9: "WXYZ",
};

module.exports = { pinPadMetrics, KEY_LETTERS, MIN_KEY, MAX_KEY };
