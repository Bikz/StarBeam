import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";

import {
  decryptBytes,
  decryptString,
  encryptBytes,
  encryptString,
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
