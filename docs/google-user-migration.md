# Pre-Cutover Administrative Account Linking Procedure (v1.5.11)

## Overview
In Palate v1.5.11, Jellyfin is the exclusive authentication provider. Direct Google OAuth sign-in has been retired. To ensure users created during the Google OAuth era retain seamless access to their recipes, schedules, household memberships, and AI configuration, this document defines the administrative procedure for account linkage.

> [!IMPORTANT]
> **Deployment Prerequisite**: Production contains exactly **4 Google-era user accounts** with plaintext OAuth tokens. Deployment of v1.5.11 to production is **BLOCKED** until these 4 accounts are pre-linked to Jellyfin identities or individually reviewed by the administrator.

## Safety & Data Integrity Guarantees
- **No Automatic Merging**: Palate **never** automatically merges accounts based on email address or username. Doing so risks account takeover if Jellyfin usernames match external email prefixes.
- **Idempotency**: The account-link utility (`linkPalateUserToJellyfin`) is fully idempotent. Running it repeatedly produces the same secure outcome.
- **Conflict Prevention**:
  - If a Jellyfin identity is already associated with another Palate user, the operation aborts immediately.
  - If a Palate user already has an associated Jellyfin identity, the operation aborts immediately.
- **Zero Data Loss**: User recipes, schedules, household memberships, invite codes, and configuration records are associated with the `User.id` primary key and remain completely intact.
- **Audit & Approval**: No migration script or identity linkage should ever be executed in production without explicit approval.

---

## Pre-Cutover Assessment (Read-Only)

Before deploying v1.5.11, administrators must run the read-only inspection commands:

```bash
# 1. Count Google-era accounts and unlinked users
npm run admin:users:count-google

# 2. Inspect identity collision and matching readiness report
npm run admin:users:collision-report

# 3. Inspect Google OAuth token encryption status
npm run admin:tokens:inspect
```

These commands output aggregated JSON counts only (`totalGoogleAccounts: 4`, `unlinkedGoogleUsers: 4`, `alreadyLinked: 0`, etc.) without logging tokens, emails, usernames, or any personal identifying information.

---

## Token Encryption Migration for Historical Accounts

In v1.5.11, Google Calendar integration tokens stored in `Account` must be encrypted at rest with AES-256-GCM. An administrative migration utility is provided to encrypt historical plaintext tokens safely:

```bash
# Dry run (verifies in-memory roundtrip without writing to database):
npm run admin:tokens:dry-run

# Live execution (requires explicit confirmation flag):
npm run admin:tokens:migrate
```

### Safety Properties:
- **Atomic Compare-And-Swap (CAS)**: Queries match existing `access_token` and `refresh_token` predicates, guaranteeing rows modified concurrently are skipped safely.
- **Resumable**: Safe to execute repeatedly; already-encrypted tokens (`enc:v1:`) are recognized and bypassed.
- **Aggregate Reporting**: Reports only record counts. Never prints tokens or secrets.

---

## Session Cutover & Provenance Enforcement

Because `GoogleProvider` is removed from NextAuth, legacy browser sessions authenticated under Google OAuth will no longer be valid:
1. Production `NEXTAUTH_SECRET` is preserved without requiring rotation.
2. In v1.5.11, NextAuth session callbacks, API routes, and middleware strictly check for the Jellyfin provenance marker (`token.jellyfinAuthenticated === true`).
3. Any legacy session token lacking this marker is automatically rejected as unauthenticated and directed to `/login`.
4. Users who have been pre-linked to their Jellyfin identity via `linkPalateUserToJellyfin` sign in with Jellyfin and immediately access all their historical data.
5. Their Google Calendar connection remains active, with tokens securely encrypted at rest.

---

## Migration Steps for Affected Users

For each of the 4 Google users transitioning to Jellyfin:

1. **Verify Jellyfin Account**:
   Confirm the user has an active Jellyfin account on the target Jellyfin server. Obtain:
   - `jellyfinServerId`: The exact server ID from `curl -s "$JELLYFIN_INTERNAL_URL/System/Info/Public" | jq -r .Id`.
   - `jellyfinUserId`: The user's Jellyfin user GUID.
   - `jellyfinUsername`: The user's exact Jellyfin username.

2. **Obtain Palate User ID**:
   Locate the user's Palate `User.id` (from the administrative console).

3. **Execute Pre-Link Command**:
   Run the administrative linking script with explicit confirmation:

   ```bash
   npm run admin:users:pre-link -- \
     --confirmed \
     --palate-user-id="<PALATE_USER_ID>" \
     --jellyfin-server-id="<JELLYFIN_SERVER_ID>" \
     --jellyfin-user-id="<JELLYFIN_USER_ID>" \
     --jellyfin-username="<JELLYFIN_USERNAME>"
   ```

4. **Verify Linkage**:
   Re-run the collision and unlinked counts:
   ```bash
   npm run admin:users:collision-report
   npm run admin:users:count-google
   ```
   When `unlinkedGoogleUsers` reaches `0`, the deployment prerequisite is satisfied.
The user signs in using their Jellyfin credentials at `/login`. They will immediately have access to their existing recipes, household, configuration, and connected Google Calendar.

---

## Rollback / Emergency Access

If a user requires access recovery before their Jellyfin account is linked:
- Existing `Account`, `Session`, and `User` database rows remain intact.
- No historical records were deleted in v1.5.11.
- In an emergency, the user can be linked to a newly provisioned Jellyfin user ID using the utility above.
