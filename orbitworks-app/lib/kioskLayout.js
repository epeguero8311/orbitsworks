// Kiosk sizes and timers shared by the kiosk screens (iPad round 1).

// PIN pad drawn 1.4x on the Kiosk (Home + Kiosk Settings pad). Still fits
// an iPad in portrait without scrolling (smallest: iPad mini, 744 x 1133 pt).
export const KIOSK_PAD_SCALE = 1.4;

// Back to Home with no touch after an employee's PIN (the Action screen and
// the Break screen) and on the kiosk Create account form: 8 s (final audit
// 2026-11-27; was 15 s, before that 25 s). The camera keeps its 60 s safety net (never while
// a photo is being saved); the Kiosk Settings pad (30 s) and Kiosk
// Settings (2 min) are admin screens and unchanged.
export const KIOSK_IDLE_ACTION_MS = 8 * 1000;
export const KIOSK_IDLE_CAMERA_MS = 60 * 1000;
