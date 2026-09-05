import "server-only";
import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_DOMAIN = "palate:protected-field:v1";
export const PROTECTED_FIELD_PREFIX = "enc:field:v1:";

export type ProtectedFieldPurpose =
  | "chat-session-title"
  | "chat-message-content"
  | "chat-message-thought";

export type ProtectedFieldClassification =
  | "encrypted"
  | "plaintext"
  | "malformed"
  | "unreadable";

function getSecret(): string {
  const primarySecret = process.env.PALATE_ENCRYPTION_SECRET;
  if (primarySecret) return primarySecret;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "FATAL: PALATE_ENCRYPTION_SECRET must be configured in production for protected fields."
    );
  }

  const developmentFallback = process.env.NEXTAUTH_SECRET;
  if (!developmentFallback) {
    throw new Error(
      "FATAL: Secure encryption secret is missing. Set PALATE_ENCRYPTION_SECRET in your environment."
    );
  }

  console.warn(
    "[ProtectedField] PALATE_ENCRYPTION_SECRET is missing; using NEXTAUTH_SECRET outside production."
  );
  return developmentFallback;
}

function derivePurposeKey(purpose: ProtectedFieldPurpose): Buffer {
  return crypto
    .createHmac("sha256", getSecret())
    .update(`${KEY_DOMAIN}:${purpose}`)
    .digest();
}

function aadFor(purpose: ProtectedFieldPurpose): Buffer {
  return Buffer.from(`${KEY_DOMAIN}:${purpose}`, "utf8");
}

function parseEnvelope(value: string): {
  iv: Buffer;
  authTag: Buffer;
  ciphertext: Buffer;
} | null {
  if (!value.startsWith(PROTECTED_FIELD_PREFIX)) return null;

  const parts = value.slice(PROTECTED_FIELD_PREFIX.length).split(":");
  if (
    parts.length !== 3 ||
    !/^[0-9a-f]{24}$/i.test(parts[0]) ||
    !/^[0-9a-f]{32}$/i.test(parts[1]) ||
    !/^[0-9a-f]*$/i.test(parts[2]) ||
    parts[2].length % 2 !== 0
  ) {
    throw new Error("Malformed protected-field envelope.");
  }

  return {
    iv: Buffer.from(parts[0], "hex"),
    authTag: Buffer.from(parts[1], "hex"),
    ciphertext: Buffer.from(parts[2], "hex"),
  };
}

export function classifyProtectedField(
  value: string,
  purpose: ProtectedFieldPurpose
): ProtectedFieldClassification {
  if (!value.startsWith(PROTECTED_FIELD_PREFIX)) return "plaintext";

  let envelope;
  try {
    envelope = parseEnvelope(value);
  } catch {
    return "malformed";
  }

  if (!envelope) return "plaintext";

  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, derivePurposeKey(purpose), envelope.iv);
    decipher.setAAD(aadFor(purpose));
    decipher.setAuthTag(envelope.authTag);
    decipher.update(envelope.ciphertext);
    decipher.final();
    return "encrypted";
  } catch {
    return "unreadable";
  }
}

export function encryptProtectedField(value: string, purpose: ProtectedFieldPurpose): string {
  const classification = classifyProtectedField(value, purpose);
  if (classification === "encrypted") return value;
  if (classification !== "plaintext") {
    throw new Error(`Refusing to overwrite ${classification} protected-field data.`);
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, derivePurposeKey(purpose), iv);
  cipher.setAAD(aadFor(purpose));
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${PROTECTED_FIELD_PREFIX}${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
}

export function decryptProtectedField(value: string, purpose: ProtectedFieldPurpose): string {
  if (!value.startsWith(PROTECTED_FIELD_PREFIX)) {
    return value;
  }

  const envelope = parseEnvelope(value);
  if (!envelope) return value;

  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, derivePurposeKey(purpose), envelope.iv);
    decipher.setAAD(aadFor(purpose));
    decipher.setAuthTag(envelope.authTag);
    return Buffer.concat([
      decipher.update(envelope.ciphertext),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("Failed to decrypt protected field: data is corrupt or the encryption key is wrong.");
  }
}
