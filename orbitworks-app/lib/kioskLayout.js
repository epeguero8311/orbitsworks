// Kiosk sizes and timers shared by the kiosk screens (iPad round 1).

// PIN pad drawn 1.4x on the Kiosk (Home + Kiosk Settings pad). Still fits
// an iPad in portrait without scrolling (smallest: iPad mini, 744 x 1133 pt).
export const KIOSK_PAD_SCALE = 1.4;

// Back to Home with no touch after an employee's PIN (the Action screen and
// the Break screen) and on the kiosk Create account form: 15 s (cleanup
// 2026-11-26; was 25 s). The camera keeps its 60 s safety net (never while
// a photo is being saved); the Kiosk Settings pad (30 s) and Kiosk
// Settings (2 min) are admin screens and unchanged.
export const KIOSK_IDLE_ACTION_MS = 15 * 1000;
export const KIOSK_IDLE_CAMERA_MS = 60 * 1000;
