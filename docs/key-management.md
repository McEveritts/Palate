# Cryptographic Key Separation & Management (v1.5.11)

## Overview
Palate v1.5.11 strictly enforces cryptographic key separation across independent functional boundaries. Secret overloading (where `NEXTAUTH_SECRET` previously served as authentication salt, session signing key, encryption key, and rate limit HMAC key) has been eliminated.

---

## Required Production Secrets & Key Derivation

In production (`NODE_ENV=production`), Palate requires independent secrets with minimum entropy of 32 characters. Dedicated domain-separated keys are derived using HMAC-SHA256:

| Environment Variable | Derived Purpose & Domain Separation Tag | Minimum Entropy | Production Enforcement |
|---|---|---|---|
| `NEXTAUTH_SECRET` | NextAuth session JWT signing & session cookies | 32 random characters | **FATAL**: Server startup halted if missing or < 32 chars. |
| `PALATE_ENCRYPTION_SECRET` | AES-256-GCM encryption derived keys:<br>• `palate:google-oauth-token:v1` (Google OAuth tokens)<br>• `palate:gemini-api-key:v1` (UserConfig Gemini API keys)<br>• `palate:oauth-state:v1` (OAuth PKCE state cookies) | 32 random characters | **FATAL**: Server startup halted if missing or < 32 chars. Runtime token decryption fails closed. Newly introduced OAuth-token envelopes do NOT fall back to `NEXTAUTH_SECRET`. |
| `PALATE_RATE_LIMIT_SECRET` | HMAC-SHA256 derivation of login rate limiter bucket keys | 32 random characters | **FATAL**: Fails closed, blocking login attempts if missing. |
| `CRON_SECRET` | Timing-safe Bearer token for `/api/curate` automation | 32 random characters | **FATAL**: Returns 401 Unauthorized if missing or mismatched. |

---

## Pairwise Secret Verification & Timing Safety

At startup (`src/lib/secrets.ts`), Palate performs pairwise verification across all defined secrets:
- Every production secret must meet the minimum 32-character requirement.
- No two secrets may share the same value (all 4 required production secrets must be pairwise distinct).
- Comparison is performed using `timingSafeEqualStrings` (`src/lib/cronAuth.ts`), a custom constant-time equality helper that safely handles strings of different lengths without throwing Node.js `ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH` exceptions.
- Secret values are never logged, printed, or included in error messages.

---

## Secret Generation Procedure

Generate high-entropy secrets using OpenSSL:

```bash
# Generate PALATE_ENCRYPTION_SECRET
openssl rand -hex 32

# Generate PALATE_RATE_LIMIT_SECRET
openssl rand -hex 32

# Generate CRON_SECRET
openssl rand -hex 32
```

---

## Bounded Legacy Decryption Transition

During the transition to v1.5.11, existing `UserConfig` rows may contain ciphertexts encrypted with legacy `NEXTAUTH_SECRET`.

To ensure zero service disruption:
1. `decryptKey` first attempts decryption using `PALATE_ENCRYPTION_SECRET`.
2. If primary decryption fails, it falls back to decrypting with legacy `NEXTAUTH_SECRET`.
3. Whenever the fallback is used, a structured warning is emitted:
   `[Encryption] Decrypted ciphertext using legacy NEXTAUTH_SECRET fallback. Re-encryption with PALATE_ENCRYPTION_SECRET required.`
4. For Google OAuth tokens (`enc:v1:...`), decryption strictly fails closed without `PALATE_ENCRYPTION_SECRET`; no fallback to `NEXTAUTH_SECRET` is permitted for OAuth envelopes.

---

## Administrative Encryption Migration Procedure

Run migrations using the pinned administrative npm scripts:

1. **UserConfig Gemini Keys**:
   ```bash
   # Inspect current encryption status
   npm run admin:userconfig:inspect

   # Dry-run migration
   npm run admin:userconfig:dry-run

   # Execute live migration
   npm run admin:userconfig:migrate
   ```

2. **Google OAuth Tokens**:
   ```bash
   # Inspect token classification (primaryKeyEncrypted, plaintextLegacy, malformed, unreadable)
   npm run admin:tokens:inspect

   # Dry-run token encryption
   npm run admin:tokens:dry-run

   # Execute live token encryption
   npm run admin:tokens:migrate
   ```

All live migrations utilize atomic Compare-And-Swap (CAS) update predicates to prevent concurrent overwrites and verify in-memory roundtrip decryption prior to committing database changes.

