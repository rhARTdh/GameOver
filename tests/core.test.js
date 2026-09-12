"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Core = require("../core.js");
const qrcode = require("../vendor/qrcode.js");

const ADDRESSES = {
  contributor: "0x1111111111111111111111111111111111111111",
  receiver: "0x2222222222222222222222222222222222222222",
  contract: "0x3333333333333333333333333333333333333333"
};

test("ABI primitives encode and decode without a framework", () => {
  assert.equal(Core.encodeAddress(ADDRESSES.receiver).length, 64);
  assert.equal(Core.encodeUint(255n).slice(-2), "ff");
  assert.equal(Core.encodeCall("12345678", [Core.encodeUint(1n)]).length, 74);
  assert.equal(Core.decodeAddressWord(Core.encodeAddress(ADDRESSES.contributor)), ADDRESSES.contributor);
  assert.equal(Core.decodeBoolWord(Core.encodeUint(1n)), true);
  assert.equal(Core.decodeUintWord(Core.encodeUint(42n)), 42n);
  assert.throws(() => Core.normalizeAddress("not-an-address"), /valid 0x wallet/);
});

test("statement commitment is deterministic and bound to both wallets", async () => {
  const salt = `0x${"44".repeat(32)}`;
  const id = `0x${"55".repeat(32)}`;
  const context = { chainId: 11155111, contract: ADDRESSES.contract, id, ...ADDRESSES };
  const first = await Core.statementDigest("Repaired the chair", salt, context);
  const second = await Core.statementDigest("Repaired the chair", salt, context);
  const changedReceiver = await Core.statementDigest("Repaired the chair", salt, { ...context, receiver: ADDRESSES.contributor });
  assert.equal(first, second);
  assert.match(first, /^0x[0-9a-f]{64}$/);
  assert.notEqual(first, changedReceiver);
});

test("private invite round-trips and rejects ciphertext tampering", async () => {
  const header = {
    version: 4,
    chainId: 11155111,
    contract: ADDRESSES.contract,
    id: `0x${"66".repeat(32)}`,
    contributor: ADDRESSES.contributor,
    receiver: ADDRESSES.receiver,
    digest: `0x${"77".repeat(32)}`,
    epoch: "21000"
  };
  const token = await Core.encryptInvite(header, { statement: "Fixed the chair", salt: `0x${"88".repeat(32)}` });
  assert.deepEqual(Core.inviteHeader(token), {
    version: 4,
    chainId: "11155111",
    contract: ADDRESSES.contract,
    id: header.id,
    contributor: ADDRESSES.contributor,
    receiver: ADDRESSES.receiver,
    digest: header.digest,
    epoch: "21000"
  });
  const decrypted = await Core.decryptInvite(token);
  assert.equal(decrypted.privatePayload.statement, "Fixed the chair");

  const [validEnvelope, validKey] = token.split(".");
  const wrongVersion = Core.decodePayload(validEnvelope);
  wrongVersion.version = 3;
  assert.throws(() => Core.inviteHeader(`${Core.encodePayload(wrongVersion)}.${validKey}`), /not a GameOver v4/);

  const [envelope, key] = token.split(".");
  const tamperedCharacter = envelope.at(-1) === "A" ? "B" : "A";
  await assert.rejects(() => Core.decryptInvite(`${envelope.slice(0, -1)}${tamperedCharacter}.${key}`));
});

test("ETH, price and display arithmetic is integer-safe", () => {
  assert.equal(Core.weiFromEth("0.010000000000000001"), 10_000_000_000_000_001n);
  assert.equal(Core.priceToScaled("3123.45"), 312_345_000_000n);
  assert.equal(Core.formatEth(1_234_567_890_000_000_000n, 6), "1.234567");
  assert.equal(Core.formatUsdPrice(312_345_000_000n), "3,123.45");
  assert.throws(() => Core.weiFromEth("0"), /greater than zero/);
  assert.throws(() => Core.parseDecimal("1.0000000000000000001", 18, "amount"), /at most 18/);
});

test("vendored QR generator handles a full-sized encrypted invite", async () => {
  const header = {
    chainId: 11155111,
    contract: ADDRESSES.contract,
    id: `0x${"99".repeat(32)}`,
    contributor: ADDRESSES.contributor,
    receiver: ADDRESSES.receiver,
    digest: `0x${"aa".repeat(32)}`,
    epoch: "21000"
  };
  const token = await Core.encryptInvite(header, { statement: "x".repeat(280), salt: `0x${"bb".repeat(32)}` });
  const qr = qrcode(0, "L");
  qr.addData(`https://example.test/#invite=${token}`);
  qr.make();
  const svg = qr.createSvgTag(2, 0);
  assert.match(svg, /^<svg/);
  assert.ok(qr.getModuleCount() > 100);
});
