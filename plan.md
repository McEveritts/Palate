# Project Plan

## Track 1: Core Interface Stabilization
**Goal:** Resolve identified technical debt (cache invalidation, regex fragility) to stabilize the core interface, preparing the foundation for Phase 6 (Vault Visualization).

### Phase 1: Regex Fragility Remediation
- [x] Investigate the "Brutal Fallback Parser" in `SageHero.tsx` and `src/lib/sage.ts`.
- [x] Write unit tests for edge cases in the fallback parser.
- [x] Refactor the regex logic to be more robust against malformed LLM outputs.

### Phase 2: In-Memory Cache Optimization
- [x] Audit the current in-memory cache implementation for the USDA macros (`vault/macros/`).
- [x] Implement robust cache invalidation logic (e.g., TTL, explicit eviction).
- [x] Add unit tests to verify cache hits, misses, and invalidation triggers.

### Phase 3: Core Interface Polish
- [x] Review UI components for minor glitches reported during the code review.
- [x] Ensure AetherFlow design system rules (Glassmorphism, aurora) are consistently applied across the hero section.