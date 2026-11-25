// Tips (Task 3) - the Tips field's dollar parser (lib/validators/shiftTip.ts).
// Plain Node. Run via: node --test test/shiftTip.test.mjs
import "./helpers/aliasHooks.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { tipAmountSchema, setShiftTipSchema, formatTipCents, MAX_TIP_CENTS, TIP_ERRORS } from "../lib/validators/shiftTip.ts";

const cents = (v) => tipAmountSchema.parse(v);
const err = (v) => tipAmountSchema.safeParse(v).error?.issues[0]?.message;

test("dollar strings -> exact whole cents (no float rounding)", () => {
  assert.equal(cents("45"), 4500);
  assert.equal(cents("45.5"), 4550);
  assert.equal(cents("45.50"), 4550);
  assert.equal(cents("$45.00"), 4500);
  assert.equal(cents(" 1,000 "), 100000);
  assert.equal(cents("0.29"), 29);
  assert.equal(cents("0.07"), 7);
  assert.equal(cents(".5"), 50);
  assert.equal(cents("12."), 1200);
  assert.equal(cents(""), 0);
  assert.equal(cents("0"), 0);
});

test("refused: negatives, letters, 3+ decimals, over $1,000", () => {
  assert.equal(err("-5"), TIP_ERRORS.notANumber);
  assert.equal(err("abc"), TIP_ERRORS.notANumber);
  assert.equal(err("."), TIP_ERRORS.notANumber);
  assert.equal(err("1.2.3"), TIP_ERRORS.notANumber);
  assert.equal(err("4.505"), TIP_ERRORS.tooManyDecimals);
  assert.equal(err("1000.01"), TIP_ERRORS.tooBig);
  assert.equal(cents("1000.00"), MAX_TIP_CENTS);
});

test("call payload + display", () => {
  assert.equal(setShiftTipSchema.safeParse({ eventId: "e1", amountCents: 4500 }).success, true);
  assert.equal(setShiftTipSchema.safeParse({ eventId: "e1", amountCents: 45.5 }).success, false);
  assert.equal(setShiftTipSchema.safeParse({ eventId: "", amountCents: 1 }).success, false);
  assert.equal(formatTipCents(4500), "$45.00");
  assert.equal(formatTipCents(undefined), "$0.00");
  assert.equal(formatTipCents(7), "$0.07");
});
