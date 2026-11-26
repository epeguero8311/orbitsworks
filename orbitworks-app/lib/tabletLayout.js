// Task 7 (tablet landscape, L1) - pure rules, no React Native imports, so
// test/tabletLayout.test.js runs them under `node --test`.
//
//  - Phones stay portrait: App.js locks them at start (expo-screen-orientation).
//    Tablets (iPad, incl. Split View) may rotate.
//  - Wide landscape (a tablet on its side): the stacked cards on the
//    supervisor Dashboard become a 2x2 grid; Kiosk Home goes side by side
//    (clock | PIN pad).
//  - Every other supervisor / kiosk screen keeps a max width, centered, so
//    rows and buttons don't stretch across a 13" screen.

// Below this width the stacked phone layout stays (iPad Split View halves,
// iPad portrait). Smallest iPad landscape is 1133 pt; a 2/3 Split View on
// an 11" iPad is ~ 800 pt.
export const GRID_MIN_WIDTH = 900;
// Below this height a side-by-side layout doesn't fit the 1.4x PIN pad.
export const GRID_MIN_HEIGHT = 600;
// Content max width on tablets (no effect on phones, which are narrower).
export const CONTENT_MAX_WIDTH = 760;

// { landscape, grid } for a window of width x height (points).
export function layoutFor(width, height) {
  const w = Number(width) || 0;
  const h = Number(height) || 0;
  const landscape = w > h;
  return { landscape, grid: landscape && w >= GRID_MIN_WIDTH && h >= GRID_MIN_HEIGHT };
}

// Lock to portrait unless the device is known to be a tablet (or a desktop /
// TV - never locked). Unknown -> locked: a phone must never rotate.
// deviceType = expo-device Device.deviceType; types = Device.DeviceType.
export function shouldLockPortrait(deviceType, types) {
  if (!types) return true;
  return !(deviceType === types.TABLET || deviceType === types.DESKTOP || deviceType === types.TV);
}

// Splits a list of cells into rows of `perRow` (the 2x2 grid).
export function gridRows(cells, perRow = 2) {
  const list = (cells || []).filter(Boolean);
  const rows = [];
  for (let i = 0; i < list.length; i += perRow) rows.push(list.slice(i, i + perRow));
  return rows;
}
