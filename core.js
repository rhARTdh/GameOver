(function attachGameOverCore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GameOverCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createGameOverCore() {
  "use strict";

  const WORD_HEX_LENGTH = 64;
  const UINT_256 = 1n << 256n;
  const INT_256_SIGN = 1n << 255n;
  const WEI_PER_ETH = 10n ** 18n;
  const WEIGHT_SCALE = 10n ** 9n;

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

  function encodeUint(value) {
    const number = typeof value === "bigint" ? value : BigInt(value);
    if (number < 0n || number >= UINT_256) throw new Error("Unsigned integer is out of range.");
    return number.toString(16).padStart(WORD_HEX_LENGTH, "0");
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

  function decodeBoolWord(word) {
    return decodeUintWord(word) !== 0n;
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
      contributor: decodeAddressWord(words[0]),
      receiver: decodeAddressWord(words[1]),
      statementDigest: `0x${words[2].toLowerCase()}`,
      proposedAt: decodeUintWord(words[3]),
      confirmedAt: decodeUintWord(words[4]),
      epoch: decodeUintWord(words[5]),
      status: Number(decodeUintWord(words[6]))
    };
  }

  function decodeSettlement(value) {
    const words = splitWords(value);
    if (words.length < 7) throw new Error("Incomplete settlement response.");
    return {
      finalized: decodeBoolWord(words[0]),
      released: decodeBoolWord(words[1]),
      closePrice: decodeUintWord(words[2]),
      pool: decodeUintWord(words[3]),
      totalWeight: decodeUintWord(words[4]),
      remaining: decodeUintWord(words[5]),
      claimedWallets: decodeUintWord(words[6])
    };
  }

  function decodeConfirmedEvent(data) {
    const words = splitWords(data);
    if (words.length < 2) throw new Error("Incomplete confirmation event.");
    return {
      epoch: decodeUintWord(words[0]),
      confirmedAt: decodeUintWord(words[1])
    };
  }

  function randomBytes(byteLength, cryptoProvider) {
    const provider = cryptoProvider || globalThis.crypto;
    if (!provider || typeof provider.getRandomValues !== "function") {
      throw new Error("Secure random generation is unavailable in this browser.");
    }
    const bytes = new Uint8Array(byteLength);
    provider.getRandomValues(bytes);
    return bytes;
  }

  function bytesToHex(bytes) {
    return `0x${Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("")}`;
  }

  function hexToBytes(value) {
    const hex = strip0x(value);
    if (!/^[0-9a-fA-F]*$/.test(hex) || hex.length % 2 !== 0) throw new Error("Invalid hexadecimal data.");
    return Uint8Array.from(hex.match(/.{2}/g) || [], pair => parseInt(pair, 16));
  }

  function randomHex(byteLength, cryptoProvider) {
    return bytesToHex(randomBytes(byteLength, cryptoProvider));
  }

  function digestMaterial(statement, salt, context) {
    const clean = String(statement || "").trim();
    if (!clean) throw new Error("Describe the contribution.");
    const details = context || {};
    return [
      "GAMEOVER:4",
      String(details.chainId || ""),
      details.contract ? normalizeAddress(details.contract) : "",
      details.id ? `0x${encodeBytes32(details.id)}` : "",
      details.contributor ? normalizeAddress(details.contributor) : "",
      details.receiver ? normalizeAddress(details.receiver) : "",
      `0x${encodeBytes32(salt)}`,
      clean
    ].join("\n");
  }

  async function statementDigest(statement, salt, context, cryptoProvider) {
    const provider = cryptoProvider || globalThis.crypto;
    if (!provider || !provider.subtle) throw new Error("Secure hashing is unavailable in this browser.");
    const material = digestMaterial(statement, salt, context);
    const digest = await provider.subtle.digest("SHA-256", new TextEncoder().encode(material));
    return bytesToHex(new Uint8Array(digest));
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
    return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  }

  function decodePayload(value) {
    const json = new TextDecoder().decode(base64UrlToBytes(value));
    return JSON.parse(json);
  }

  function canonicalInviteHeader(header) {
    if (!header || typeof header !== "object") throw new Error("The private invite header is invalid.");
    if (header.version !== undefined && Number(header.version) !== 4) {
      throw new Error("This invite is not a GameOver v4 invite.");
    }
    const chainId = String(header.chainId);
    const epoch = String(header.epoch);
    if (!/^\d+$/.test(chainId) || !/^\d+$/.test(epoch)) {
      throw new Error("The private invite network or epoch is invalid.");
    }
    return {
      version: 4,
      chainId,
      contract: normalizeAddress(header.contract),
      id: `0x${encodeBytes32(header.id)}`,
      contributor: normalizeAddress(header.contributor),
      receiver: normalizeAddress(header.receiver),
      digest: `0x${encodeBytes32(header.digest)}`,
      epoch
    };
  }

  function inviteAad(header) {
    return new TextEncoder().encode(`GAMEOVER-PRIVATE-INVITE:4\n${JSON.stringify(header)}`);
  }

  async function encryptInvite(headerInput, privatePayload, cryptoProvider) {
    const provider = cryptoProvider || globalThis.crypto;
    if (!provider || !provider.subtle) throw new Error("Private invite encryption is unavailable.");
    const header = canonicalInviteHeader(headerInput);
    const keyBytes = randomBytes(32, provider);
    const iv = randomBytes(12, provider);
    const key = await provider.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt"]);
    const plaintext = new TextEncoder().encode(JSON.stringify(privatePayload));
    const encrypted = await provider.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: inviteAad(header), tagLength: 128 },
      key,
      plaintext
    );
    const envelope = {
      ...header,
      iv: bytesToBase64Url(iv),
      ciphertext: bytesToBase64Url(new Uint8Array(encrypted))
    };
    return `${encodePayload(envelope)}.${bytesToBase64Url(keyBytes)}`;
  }

  function inviteHeader(token) {
    const [encodedEnvelope, encodedKey, extra] = String(token || "").split(".");
    if (!encodedEnvelope || !encodedKey || extra) throw new Error("The private invite is incomplete.");
    const envelope = decodePayload(encodedEnvelope);
    const header = canonicalInviteHeader(envelope);
    if (!envelope.iv || !envelope.ciphertext) throw new Error("The private invite is incomplete.");
    if (base64UrlToBytes(encodedKey).length !== 32 || base64UrlToBytes(envelope.iv).length !== 12) {
      throw new Error("The private invite key or nonce is invalid.");
    }
    return header;
  }

  async function decryptInvite(token, cryptoProvider) {
    const provider = cryptoProvider || globalThis.crypto;
    if (!provider || !provider.subtle) throw new Error("Private invite decryption is unavailable.");
    const [encodedEnvelope, encodedKey, extra] = String(token || "").split(".");
    if (!encodedEnvelope || !encodedKey || extra) throw new Error("The private invite is malformed.");
    const envelope = decodePayload(encodedEnvelope);
    const header = canonicalInviteHeader(envelope);
    const keyBytes = base64UrlToBytes(encodedKey);
    const iv = base64UrlToBytes(envelope.iv);
    if (keyBytes.length !== 32 || iv.length !== 12) throw new Error("The private invite key is invalid.");
    const key = await provider.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["decrypt"]);
    let decrypted;
    try {
      decrypted = await provider.subtle.decrypt(
        { name: "AES-GCM", iv, additionalData: inviteAad(header), tagLength: 128 },
        key,
        base64UrlToBytes(envelope.ciphertext)
      );
    } catch (_error) {
      throw new Error("The private invite was altered or its key is invalid.");
    }
    const privatePayload = JSON.parse(new TextDecoder().decode(new Uint8Array(decrypted)));
    return { header, privatePayload };
  }

  function parseDecimal(value, decimals, label) {
    const text = String(value || "").trim();
    if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text)) throw new Error(`Enter a valid ${label}.`);
    const [whole, fraction = ""] = text.split(".");
    if (fraction.length > decimals) throw new Error(`${label} supports at most ${decimals} decimal places.`);
    return BigInt(whole) * (10n ** BigInt(decimals)) + BigInt((fraction || "").padEnd(decimals, "0") || "0");
  }

  function weiFromEth(value) {
    const wei = parseDecimal(value, 18, "ETH amount");
    if (wei <= 0n) throw new Error("Enter an ETH amount greater than zero.");
    return wei;
  }

  function priceToScaled(value) {
    const price = parseDecimal(value, 8, "ETH/USD price");
    if (price <= 0n) throw new Error("Enter a price greater than zero.");
    return price;
  }

  function formatUnits(value, decimals, maximumFractionDigits) {
    const number = typeof value === "bigint" ? value : BigInt(value || 0);
    const negative = number < 0n;
    const absolute = negative ? -number : number;
    const scale = 10n ** BigInt(decimals);
    const whole = absolute / scale;
    const fraction = (absolute % scale).toString().padStart(decimals, "0");
    const maximum = Math.max(0, Math.min(decimals, maximumFractionDigits ?? decimals));
    const trimmed = fraction.slice(0, maximum).replace(/0+$/, "");
    return `${negative ? "-" : ""}${whole}${trimmed ? `.${trimmed}` : ""}`;
  }

  function formatEth(value, maximumFractionDigits) {
    return formatUnits(value, 18, maximumFractionDigits ?? 6);
  }

  function formatUsdPrice(value) {
    return Number(formatUnits(value, 8, 2)).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function formatWeight(value) {
    return formatUnits(value, 9, 3);
  }

  function hexQuantity(value) {
    const number = typeof value === "bigint" ? value : BigInt(value || 0);
    return `0x${number.toString(16)}`;
  }

  function shortAddress(address) {
    return isAddress(address) ? `${address.slice(0, 6)}…${address.slice(-4)}` : "Not connected";
  }

  return Object.freeze({
    strip0x,
    isAddress,
    normalizeAddress,
    encodeAddress,
    encodeBytes32,
    encodeUint,
    encodeCall,
    splitWords,
    decodeUintWord,
    decodeIntWord,
    decodeBoolWord,
    decodeAddressWord,
    topicToAddress,
    decodeEncounter,
    decodeSettlement,
    decodeConfirmedEvent,
    randomBytes,
    bytesToHex,
    hexToBytes,
    randomHex,
    digestMaterial,
    statementDigest,
    bytesToBase64Url,
    base64UrlToBytes,
    encodePayload,
    decodePayload,
    encryptInvite,
    inviteHeader,
    decryptInvite,
    parseDecimal,
    weiFromEth,
    priceToScaled,
    formatUnits,
    formatEth,
    formatUsdPrice,
    formatWeight,
    hexQuantity,
    shortAddress,
    WEI_PER_ETH,
    WEIGHT_SCALE
  });
});
