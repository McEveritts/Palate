import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";

/**
 * Derives a deterministic 32-byte (256-bit) encryption key from the environment secret
 * using SHA-256. This ensures that any secret length can be safely used.
 */
const getEncryptionKey = (): Buffer => {
  const secret = process.env.PALATE_ENCRYPTION_SECRET || process.env.NEXTAUTH_SECRET || "fallback_palate_encryption_secret_must_be_32_bytes_long!";
  return crypto.createHash("sha256").update(secret).digest();
};

export interface EncryptedData {
  encryptedString: string;
  iv: string;
  authTag: string;
}

/**
 * Encrypts a string using AES-256-GCM with a random 12-byte IV.
 * Returns the encrypted string, IV, and GCM authentication tag in hex.
 */
export function encryptKey(text: string): EncryptedData {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12); // GCM standard IV is 12 bytes
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  
  const authTag = cipher.getAuthTag().toString("hex");
  
  return {
    encryptedString: encrypted,
    iv: iv.toString("hex"),
    authTag: authTag,
  };
}

/**
 * Decrypts an AES-256-GCM encrypted string given the hex IV and hex authentication tag.
 * Validates the GCM auth tag to guarantee data integrity before returning the plain-text string.
 */
export function decryptKey(encryptedString: string, ivHex: string, authTagHex: string): string {
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encryptedString, "hex", "utf8");
  decrypted += decipher.final("utf8");
  
  return decrypted;
}
