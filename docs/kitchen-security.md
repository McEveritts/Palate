# Kitchen & Household Security Model (v1.5.11)

## Overview
Palate's multi-user Kitchen architecture enables shared culinary planning, synchronized recipes, and household pantry management. This document defines the security boundaries, authorization guarantees, concurrency controls, and operational characteristics of the Kitchen subsystem.

---

## 1. Authorization Boundaries: `session.user.id` vs `householdId`

All operations strictly enforce authorization boundaries:
1. **User Identity (`session.user.id`)**:
   - Extracted directly from the validated NextAuth session token.
   - Never accepted or trusted from client request bodies, query strings, or unauthenticated headers.
   - **User-Scoped Data**: Scheduled meal planning (`ScheduledMeal`), daily calorie/macro logs (`DailyLog`), weight logs (`WeightLog`), user preferences, and personal Google Calendar connections are strictly partitioned by `userId`.
2. **Household Boundary (`householdId`)**:
   - Shared culinary assets—including recipes (`Recipe`) and pantry inventory—are partitioned by `householdId`.
   - The user's active household is resolved dynamically from the database via `getHouseholdId(userId)`.
   - Cross-household access is strictly denied: queries explicitly filter on `householdId: userHouseholdId`.

---

## 2. Concurrency Controls & Race Safety

The Kitchen subsystem implements atomic concurrency protections verified against real PostgreSQL (`palate_test`):

1. **Auto-Provisioning Concurrency**:
   - When a user logs in or accesses household resources without an assigned kitchen, `ensureUserProvisioned` uses an atomic Compare-And-Swap (CAS) update pattern.
   - If two concurrent requests attempt to create a household for the same user, the losing thread detects the race, rolls back, and immediately cleans up the redundant household, preventing orphan households.
2. **Atomic Invite Lifecycle**:
   - Generating a new invite code atomically invalidates any earlier unredeemed invite codes for that household within a single `prisma.$transaction`. At most one active invite code exists per household at any time.
   - Redeeming an invite code executes an atomic CAS update matching `id`, `usedAt: null`, and `expiresAt: { gt: now }`. If multiple joiners attempt to redeem simultaneously, exactly one succeeds; concurrent attempts fail gracefully with 400.

---

## 3. Household Membership & Departure Isolation

- **Invites & Joining**:
  - Invite codes are 8-character cryptographically secure uppercase hex tokens valid for 48 hours.
  - Redeeming an invite code is an atomic, race-proof transaction: only a single user can redeem a given invite code.
- **Member Removal (`remove-member`)**:
  - Any member can remove another member from the shared household.
  - A user cannot remove themselves via `remove-member` (they must use `leave`).
  - When a member is removed, they are immediately provisioned with their own isolated solo household (`<Name>'s Kitchen`), ensuring they are never left in an unassigned or orphaned state.
- **Leaving a Household (`leave`)**:
  - When a user departs a household with multiple members, they are automatically transitioned to a newly created solo household.
  - If a solo user initiates `leave`, the operation is handled idempotently without creating redundant duplicate households.
  - The departed user immediately loses access to the previous household's shared recipes and invite codes.
  - When the final member departs a household, orphaned households are cleanly pruned.

---

## 4. Equal-Permission Model

Palate adheres to a collaborative equal-permission household model:
- All confirmed members of a household have equal authority to view, create, edit, and delete shared recipes and invite links.
- There are no tiered "admin" vs "viewer" roles within a single household; trust is established at the household boundary through explicit invite redemption.

---

## 5. Verification Against Real PostgreSQL

All 14 core kitchen and household operational scenarios are tested against a real PostgreSQL instance (`palate_test`) via `tests/integration/kitchen.db.test.ts`:
- Auto-provisioning, idempotent concurrent provisioning, profile renaming.
- Atomic invite generation, single-use redemption, invalidation on regenerate, expiry enforcement.
- Member transfers, solo departure, last-member cleanup, and cross-household data isolation.
- Concurrency races between simultaneous joins and simultaneous join/revoke operations.

