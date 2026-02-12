import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";

import {
  decryptBytes,
  decryptBytesWithAnyKey,
  decryptString,
  decryptStringWithAnyKey,
  encryptBytes,
  encryptString,
  parseAes256GcmDecryptKeysFromEnv,
  parseAes256GcmKeyFromEnv,
} from "../src/tokenCrypto";

test("tokenCrypto: encrypt/decrypt round trip", () => {
  const key = crypto.randomBytes(32);
  const plaintext = "hello world";
  const enc = encryptString(plaintext, key);
  const dec = decryptString(enc, key);
  assert.equal(dec, plaintext);
});

test("tokenCrypto: encryptBytes/decryptBytes round trip", () => {
  const key = crypto.randomBytes(32);
  const plaintext = crypto.randomBytes(256);
  const enc = encryptBytes(plaintext, key);
  const dec = decryptBytes(enc, key);
  assert.deepEqual(dec, plaintext);
});

test("tokenCrypto: parseAes256GcmKeyFromEnv validates key length", () => {
  const original = process.env.STARB_TOKEN_ENC_KEY_B64;
  try {
    process.env.STARB_TOKEN_ENC_KEY_B64 =
      Buffer.from("short").toString("base64");
    assert.throws(() => parseAes256GcmKeyFromEnv(), /32 bytes/);
  } finally {
    if (original === undefined) delete process.env.STARB_TOKEN_ENC_KEY_B64;
    else process.env.STARB_TOKEN_ENC_KEY_B64 = original;
  }
});

test("tokenCrypto: parseAes256GcmDecryptKeysFromEnv includes fallback key", () => {
  const originalPrimary = process.env.STARB_TOKEN_ENC_KEY_B64;
  const originalFallback = process.env.STARB_TOKEN_ENC_KEY_B64_FALLBACK;

  try {
    process.env.STARB_TOKEN_ENC_KEY_B64 = crypto
      .randomBytes(32)
      .toString("base64");
    process.env.STARB_TOKEN_ENC_KEY_B64_FALLBACK = crypto
      .randomBytes(32)
      .toString("base64");

    const keys = parseAes256GcmDecryptKeysFromEnv();
    assert.equal(keys.length, 2);
  } finally {
    if (originalPrimary === undefined)
      delete process.env.STARB_TOKEN_ENC_KEY_B64;
    else process.env.STARB_TOKEN_ENC_KEY_B64 = originalPrimary;

    if (originalFallback === undefined)
      delete process.env.STARB_TOKEN_ENC_KEY_B64_FALLBACK;
    else process.env.STARB_TOKEN_ENC_KEY_B64_FALLBACK = originalFallback;
  }
});

test("tokenCrypto: decryptStringWithAnyKey supports fallback decryption", () => {
  const primary = crypto.randomBytes(32);
  const fallback = crypto.randomBytes(32);

  const ciphertext = encryptString("hello fallback", fallback);
  const plaintext = decryptStringWithAnyKey(ciphertext, [primary, fallback]);
  assert.equal(plaintext, "hello fallback");
});

test("tokenCrypto: decryptBytesWithAnyKey supports fallback decryption", () => {
  const primary = crypto.randomBytes(32);
  const fallback = crypto.randomBytes(32);

  const input = crypto.randomBytes(64);
  const ciphertext = encryptBytes(input, fallback);
  const plaintext = decryptBytesWithAnyKey(ciphertext, [primary, fallback]);
  assert.deepEqual(plaintext, input);
});
