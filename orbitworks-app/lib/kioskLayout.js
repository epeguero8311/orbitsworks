// Kiosk sizes and timers shared by the kiosk screens (iPad round 1).

// PIN pad drawn 1.4x on the Kiosk (Home + Kiosk Settings pad). Still fits
// an iPad in portrait without scrolling (smallest: iPad mini, 744 x 1133 pt).
export const KIOSK_PAD_SCALE = 1.4;

// Back to Home with no touch on the after-PIN Action screen and the Break
// timer screen: 25 s (was 30 s; iPad round 1 item 5). The camera (60 s),
// the Kiosk Settings pad (30 s) and Kiosk Settings (2 min) are unchanged.
export const KIOSK_IDLE_ACTION_MS = 25 * 1000;
