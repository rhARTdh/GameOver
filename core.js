(function attachGameOverCore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GameOverCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createGameOverCore() {
  "use strict";

  const WORD_HEX_LENGTH = 64;
  const UINT_256 = 1n << 256n;
  const INT_256_SIGN = 1n << 255n;

  function strip0x(value) {
    return String(value || "").replace(/^0x/i, "");
  }

  function isAddress(value) {
    return /^0x[0-9a-fA-F]{40}$/.test(String(value || ""));
  }

  function normalizeAddress(value) {
    if (!isAddress(value)) throw new Error("Enter a valid 0x wallet address.");
    return String(value).toLowerCase();
  }

  function encodeAddress(value) {
    return strip0x(normalizeAddress(value)).padStart(WORD_HEX_LENGTH, "0");
  }

  function encodeBytes32(value) {
    const hex = strip0x(value);
    if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error("Expected a bytes32 value.");
    return hex.toLowerCase();
  }

  function encodeCall(selector, words) {
    const method = strip0x(selector);
    if (!/^[0-9a-fA-F]{8}$/.test(method)) throw new Error("Invalid method selector.");
    return `0x${method.toLowerCase()}${words.join("")}`;
  }

  function splitWords(value) {
    const hex = strip0x(value);
    if (hex.length % WORD_HEX_LENGTH !== 0) throw new Error("Malformed ABI response.");
    const words = [];
    for (let index = 0; index < hex.length; index += WORD_HEX_LENGTH) {
      words.push(hex.slice(index, index + WORD_HEX_LENGTH));
    }
    return words;
  }

  function decodeUintWord(word) {
    return BigInt(`0x${word || "0"}`);
  }

  function decodeIntWord(word) {
    const value = decodeUintWord(word);
    return value >= INT_256_SIGN ? value - UINT_256 : value;
  }

  function decodeAddressWord(word) {
    return `0x${String(word).slice(-40)}`.toLowerCase();
  }

  function topicToAddress(topic) {
    const hex = strip0x(topic);
    if (hex.length !== WORD_HEX_LENGTH) throw new Error("Malformed address topic.");
    return `0x${hex.slice(-40)}`.toLowerCase();
  }

  function decodeEncounter(value) {
    const words = splitWords(value);
    if (words.length < 7) throw new Error("Incomplete encounter response.");
    return {
      provider: decodeAddressWord(words[0]),
      beneficiary: decodeAddressWord(words[1]),
      statementDigest: `0x${words[2].toLowerCase()}`,
      proposedAt: decodeUintWord(words[3]),
      confirmedAt: decodeUintWord(words[4]),
      epoch: decodeUintWord(words[5]),
      status: Number(decodeUintWord(words[6]))
    };
  }

  function decodeConfirmedEvent(data) {
    const words = splitWords(data);
    if (words.length < 4) throw new Error("Incomplete confirmation event.");
    return {
      providerPosition: Number(decodeIntWord(words[0])),
      beneficiaryPosition: Number(decodeIntWord(words[1])),
      epoch: decodeUintWord(words[2]),
      confirmedAt: decodeUintWord(words[3])
    };
  }

  function randomHex(byteLength, cryptoProvider) {
    const provider = cryptoProvider || globalThis.crypto;
    if (!provider || typeof provider.getRandomValues !== "function") {
      throw new Error("Secure random generation is unavailable in this browser.");
    }
    const bytes = new Uint8Array(byteLength);
    provider.getRandomValues(bytes);
    return `0x${Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("")}`;
  }

  async function statementDigest(statement, salt, cryptoProvider) {
    const clean = String(statement || "").trim();
    if (!clean) throw new Error("Describe what was exchanged.");
    const provider = cryptoProvider || globalThis.crypto;
    if (!provider || !provider.subtle) {
      throw new Error("Secure hashing is unavailable in this browser.");
    }
    const material = `GAMEOVER:1\n${encodeBytes32(salt)}\n${clean}`;
    const digest = await provider.subtle.digest("SHA-256", new TextEncoder().encode(material));
    return `0x${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("")}`;
  }

  function bytesToBase64Url(bytes) {
    let binary = "";
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    if (typeof btoa === "function") {
      return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    }
    return Buffer.from(bytes).toString("base64url");
  }

  function base64UrlToBytes(value) {
    const normalized = String(value).replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    if (typeof atob === "function") {
      const binary = atob(padded);
      return Uint8Array.from(binary, character => character.charCodeAt(0));
    }
    return Uint8Array.from(Buffer.from(padded, "base64"));
  }

  function encodePayload(payload) {
    const json = JSON.stringify(payload);
    return bytesToBase64Url(new TextEncoder().encode(json));
  }

  function decodePayload(value) {
    const json = new TextDecoder().decode(base64UrlToBytes(value));
    const payload = JSON.parse(json);
    if (!payload || payload.version !== 1) throw new Error("Unsupported encounter link.");
    return payload;
  }

  function hexQuantity(value) {
    const number = typeof value === "bigint" ? value : BigInt(value || 0);
    return `0x${number.toString(16)}`;
  }

  function shortAddress(address) {
    return isAddress(address) ? `${address.slice(0, 6)}…${address.slice(-4)}` : "Not connected";
  }

  function formatPosition(value) {
    const number = Number(value || 0);
    return number > 0 ? `+${number}` : String(number);
  }

  return Object.freeze({
    strip0x,
    isAddress,
    normalizeAddress,
    encodeAddress,
    encodeBytes32,
    encodeCall,
    splitWords,
    decodeUintWord,
    decodeIntWord,
    decodeAddressWord,
    topicToAddress,
    decodeEncounter,
    decodeConfirmedEvent,
    randomHex,
    statementDigest,
    encodePayload,
    decodePayload,
    hexQuantity,
    shortAddress,
    formatPosition
  });
});
