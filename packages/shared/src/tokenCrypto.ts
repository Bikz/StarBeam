import crypto from "node:crypto";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

export function parseAes256GcmKeyFromEnv(
  envName = "STARB_TOKEN_ENC_KEY_B64",
): Buffer {
  const b64 = requireEnv(envName);
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) {
    throw new Error(`${envName} must be 32 bytes base64 (AES-256-GCM key)`);
  }
  return key;
}

// Stored format: v1:<iv_b64>:<tag_b64>:<ciphertext_b64>
export function encryptString(plaintext: string, key: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(plaintext, "utf8")),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    "v1",
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

export function decryptString(ciphertextEnc: string, key: Buffer): string {
  const [v, ivB64, tagB64, dataB64] = ciphertextEnc.split(":");
  if (v !== "v1" || !ivB64 || !tagB64 || !dataB64) {
    throw new Error("Invalid ciphertext format");
  }

  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(data), decipher.final()]);
  return plaintext.toString("utf8");
}

// Stored format (bytes): "SB1" || iv(12) || tag(16) || ciphertext(n)
const BYTES_MAGIC = Buffer.from("SB1", "ascii");
const BYTES_IV_LEN = 12;
const BYTES_TAG_LEN = 16;

export function encryptBytes(plaintext: Buffer, key: Buffer): Buffer {
  const iv = crypto.randomBytes(BYTES_IV_LEN);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([BYTES_MAGIC, iv, tag, ciphertext]);
}

export function decryptBytes(ciphertextEnc: Buffer, key: Buffer): Buffer {
  if (ciphertextEnc.byteLength < BYTES_MAGIC.byteLength + BYTES_IV_LEN + BYTES_TAG_LEN + 1) {
    throw new Error("Invalid ciphertext format");
  }

  const magic = ciphertextEnc.subarray(0, BYTES_MAGIC.byteLength);
  if (!magic.equals(BYTES_MAGIC)) {
    throw new Error("Invalid ciphertext format");
  }

  const ivStart = BYTES_MAGIC.byteLength;
  const tagStart = ivStart + BYTES_IV_LEN;
  const dataStart = tagStart + BYTES_TAG_LEN;

  const iv = ciphertextEnc.subarray(ivStart, tagStart);
  const tag = ciphertextEnc.subarray(tagStart, dataStart);
  const data = ciphertextEnc.subarray(dataStart);

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}
