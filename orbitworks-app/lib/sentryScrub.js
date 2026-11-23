// Values that must never reach Sentry while they are on screen (the new
// PIN, and the sign-up email / password / birthday). The sign-up flow
// registers them; App.js's beforeSend / beforeBreadcrumb blank them out of
// every string in the event. Memory only. CommonJS for plain-Node tests.
//
// This is a backstop: the sign-up code never logs or reports these values
// in the first place.

const REDACTED = "[redacted]";
const MIN_LENGTH = 4;
const MAX_DEPTH = 12;

const values = new Map();

function setScrubValue(key, value) {
  if (typeof value === "string" && value.length >= MIN_LENGTH) values.set(key, value);
  else values.delete(key);
}

function clearScrubValues(keys) {
  if (!keys) values.clear();
  else keys.forEach((k) => values.delete(k));
}

function replaceAll(text, list) {
  let out = text;
  for (const v of list) if (out.includes(v)) out = out.split(v).join(REDACTED);
  return out;
}

function walk(node, list, depth) {
  if (typeof node === "string") return replaceAll(node, list);
  if (depth > MAX_DEPTH || node === null || typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map((n) => walk(n, list, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(node)) out[k] = walk(v, list, depth + 1);
  return out;
}

// Returns a copy of item with every registered value blanked. Longest first,
// so a value that contains a shorter one is removed whole.
function scrubSensitive(item, extra) {
  const list = [...values.values(), ...(extra || [])].filter((v) => typeof v === "string" && v.length >= MIN_LENGTH);
  if (list.length === 0) return item;
  list.sort((a, b) => b.length - a.length);
  try {
    return walk(item, list, 0);
  } catch {
    return item;
  }
}

module.exports = { REDACTED, setScrubValue, clearScrubValues, scrubSensitive };
