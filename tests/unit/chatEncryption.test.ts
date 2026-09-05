import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  classifyProtectedField,
  decryptProtectedField,
  encryptProtectedField,
  PROTECTED_FIELD_PREFIX,
} from "@/lib/protectedField";

describe("protected chat fields", () => {
  const originalSecret = process.env.PALATE_ENCRYPTION_SECRET;

  beforeEach(() => {
    process.env.PALATE_ENCRYPTION_SECRET = "test-field-encryption-secret-with-sufficient-entropy";
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.PALATE_ENCRYPTION_SECRET;
    else process.env.PALATE_ENCRYPTION_SECRET = originalSecret;
  });

  it("roundtrips Unicode text and is idempotent", () => {
    const plaintext = "Sage says: jalapeño, 日本語, 🥗";
    const encrypted = encryptProtectedField(plaintext, "chat-message-content");

    expect(encrypted).toMatch(/^enc:field:v1:/);
    expect(encrypted).not.toContain(plaintext);
    expect(classifyProtectedField(encrypted, "chat-message-content")).toBe("encrypted");
    expect(decryptProtectedField(encrypted, "chat-message-content")).toBe(plaintext);
    expect(encryptProtectedField(encrypted, "chat-message-content")).toBe(encrypted);
  });

  it("roundtrips an empty field without producing a malformed envelope", () => {
    const encrypted = encryptProtectedField("", "chat-message-thought");
    expect(classifyProtectedField(encrypted, "chat-message-thought")).toBe("encrypted");
    expect(decryptProtectedField(encrypted, "chat-message-thought")).toBe("");
  });

  it("binds ciphertext to its field purpose", () => {
    const encrypted = encryptProtectedField("private", "chat-message-content");

    expect(classifyProtectedField(encrypted, "chat-session-title")).toBe("unreadable");
    expect(() => decryptProtectedField(encrypted, "chat-session-title")).toThrow();
  });

  it("detects tampering and malformed envelopes", () => {
    const encrypted = encryptProtectedField("private", "chat-message-thought");
    const tampered = `${encrypted.slice(0, -1)}${encrypted.endsWith("0") ? "1" : "0"}`;

    expect(classifyProtectedField(tampered, "chat-message-thought")).toBe("unreadable");
    expect(() => decryptProtectedField(tampered, "chat-message-thought")).toThrow();
    expect(classifyProtectedField(`${PROTECTED_FIELD_PREFIX}broken`, "chat-message-thought")).toBe("malformed");
  });

  it("returns legacy plaintext during a controlled migration", () => {
    expect(decryptProtectedField("legacy plaintext", "chat-session-title")).toBe("legacy plaintext");
    expect(classifyProtectedField("legacy plaintext", "chat-session-title")).toBe("plaintext");
  });
});
