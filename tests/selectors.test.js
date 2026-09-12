"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Interface } = require("ethers");
const { compileContract } = require("./compile-helper");

test("hand-written browser selectors and event topic match the compiled v4 ABI", () => {
  const app = fs.readFileSync(path.resolve(__dirname, "..", "app.js"), "utf8");
  const interface_ = new Interface(compileContract().abi);
  const block = app.match(/const SELECTORS = Object\.freeze\(\{([\s\S]*?)\n  \}\);/);
  assert.ok(block, "SELECTORS block not found");
  const selectors = Object.fromEntries(
    [...block[1].matchAll(/^\s+(\w+):\s*"([0-9a-f]{8})",?$/gm)].map(match => [match[1], match[2]])
  );
  assert.ok(Object.keys(selectors).length > 20);
  for (const [name, selector] of Object.entries(selectors)) {
    assert.equal(interface_.getFunction(name).selector.slice(2), selector, `selector mismatch for ${name}`);
  }
  const topic = app.match(/const CONFIRMED_EVENT_TOPIC = "(0x[0-9a-f]{64})"/)[1];
  assert.equal(interface_.getEvent("EncounterConfirmed").topicHash, topic);
});
