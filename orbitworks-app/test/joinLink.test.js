// Run: node --test test/
const test = require("node:test");
const assert = require("node:assert/strict");
const { parseJoinUrl, redactJoinTokens } = require("../lib/joinLink");
const { VARIANTS } = require("../config/envRules");

const links = VARIANTS.dev.joinLinks;
const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWxYz012345_-xy";

test("QR https link gives the token", () => {
  assert.equal(parseJoinUrl(`${links.appUrl}/j/${TOKEN}`, links), TOKEN);
  assert.equal(parseJoinUrl(`${links.appUrl}/j/${TOKEN}/`, links), TOKEN);
  assert.equal(parseJoinUrl(`${links.appUrl}/j/${TOKEN}?utm=x`, links), TOKEN);
});

test("orbitsworks-dev:// button link gives the token", () => {
  assert.equal(parseJoinUrl(`${links.scheme}://j/${TOKEN}`, links), TOKEN);
});

test("other sites, paths and bad tokens are rejected", () => {
  assert.equal(parseJoinUrl(`https://evil.example.com/j/${TOKEN}`, links), null);
  assert.equal(parseJoinUrl(`${links.appUrl}.evil.com/j/${TOKEN}`, links), null);
  assert.equal(parseJoinUrl(`${links.appUrl}/x/${TOKEN}`, links), null);
  assert.equal(parseJoinUrl(`${links.appUrl}/j/short`, links), null);
  assert.equal(parseJoinUrl(`${links.appUrl}/j/${TOKEN}/extra`, links), null);
  assert.equal(parseJoinUrl(`orbitsworks://j/${TOKEN}`, links), null);
  assert.equal(parseJoinUrl("just some text", links), null);
  assert.equal(parseJoinUrl(null, links), null);
});

test("builds without crew codes accept nothing", () => {
  assert.equal(parseJoinUrl(`${links.appUrl}/j/${TOKEN}`, null), null);
  assert.equal(parseJoinUrl(`${links.appUrl}/j/${TOKEN}`, {}), null);
});

test("redaction removes tokens from text", () => {
  const out = redactJoinTokens(`opened ${links.appUrl}/j/${TOKEN} and ${links.scheme}://j/${TOKEN}`);
  assert.equal(out.includes(TOKEN), false);
  assert.match(out, /\/j\/\[redacted\]/);
});
