"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const config = fs.readFileSync(path.join(root, "config.js"), "utf8");

test("v4 language and visible rules match the approved design", () => {
  assert.match(html, /One Encounter\.\s*<\/span><span>Confirmed by Both\./);
  assert.match(html, /All in a day’s work\./);
  assert.match(html, /Contributor \+1/);
  assert.match(html, /Receiver stays neutral/);
  assert.doesNotMatch(html, /\bProvider\b|\bBeneficiary\b|−1/);
  assert.match(html, /errors|warnings/i);
  assert.match(html, /Mainnet deployment or real-value rewards/);
});

test("location is deferred in copy and absent from application capabilities", () => {
  assert.doesNotMatch(app, /geolocation|getCurrentPosition|watchPosition/i);
  assert.match(html, /Location capture or H3 commitments/);
});

test("every JavaScript ID lookup exists exactly once in the document", () => {
  const htmlIds = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  const referencedIds = [...app.matchAll(/\$\("([^"]+)"\)/g)].map(match => match[1]);
  assert.equal(new Set(htmlIds).size, htmlIds.length);
  referencedIds.forEach(id => assert.ok(htmlIds.includes(id), `Missing HTML element #${id}`));
});

test("runtime is Sepolia-only and starts safely unconfigured", () => {
  assert.match(config, /chainId:\s*"0xaa36a7"/);
  assert.match(config, /chainIdDecimal:\s*11155111/);
  assert.match(config, /contractAddress:\s*"0x0{40}"/);
  assert.doesNotMatch(app, /wallet_addEthereumChain|mainnet/i);
});

test("privacy and simulation limitations are visible in-product", () => {
  assert.match(html, /Private bearer invite/);
  assert.match(html, /Anyone holding the complete private link may read/);
  assert.match(html, /Simulated price input/);
  assert.match(html, /does not prove unique humans/);
  assert.match(html, /Experimental · unaudited/);
});
