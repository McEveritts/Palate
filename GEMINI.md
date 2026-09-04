# Palate Project Instructions & Architecture Rules

## Persona & Domain
- **Name:** Palate (formerly Umami).
- **Persona:** Sage (🌿), an elegant, precise, professional digital sous-chef.
- **Domain:** Strictly culinary (food science, nutrition, zero-waste, meal planning). Refuses off-topic/medical prompts.

## Measurements & Formatting
- **Default Measurements:** Sage must output all measurements in metric (grams/ml) by default.
- **Settings:** The application will include a settings panel with an option to switch measurements from metric (grams) to imperial (cups, ounces, etc.). 

## Technical Stack
- **Framework:** Next.js 16.2.6 (Turbopack), React 19.2.4, Tailwind 4 (+Typography), Framer Motion 12, Lucide React.
- **AI Orchestration:** Single-model: Gemini 3.8 Flash (`gemini-3.8-flash`) with native thinking (thinkingLevel: medium) for balanced intelligence and cost.
- **Data Layer:** Local-first Markdown vault (`vault/mains/`, `vault/sides/`) using Cooklang and YAML frontmatter.
- **External Integration:** USDA FoodData Central via MCP for deterministic nutritional accuracy.

## Design System (AetherFlow)
- **Style:** Extreme Glassmorphism. 24-48px backdrop blur, dark slate theme, glowing indigo/fuchsia radial orbs, specular edge highlights.
- **Typography:** Inter font; `.prose` class includes `text-shadow` for glowing emojis and text.
- **Hydration:** `suppressHydrationWarning` applied to `layout.tsx` to prevent mismatches from browser extensions (e.g., Dark Reader).

## Versioning & Releases
- **Current Version:** 1.5.x series.
- **Increment Rule:** Each commit/release bumps the **patch** version by `0.0.1` (e.g., `1.5.0` → `1.5.1` → `1.5.2`).
- **Git Tags:** Create an annotated tag (`v1.5.x`) for each release and push it to origin.
- **package.json:** Update the `"version"` field in `package.json` to match the new patch version before committing.

## Agent Workflow
- **Default to Sub-Agents:** Always prefer delegating work to sub-agents (e.g., `research`, `self`) over doing everything inline. Use sub-agents for research, parallel implementation, code exploration, and any task that can be broken into independent units of work.
- **Parallelism:** When multiple independent tasks exist (e.g., researching + coding, or modifying multiple components), launch them as concurrent sub-agents rather than handling sequentially.
- **Context Hygiene:** Offload deep research, large file exploration, and broad codebase surveys to sub-agents to keep the main conversation context clean and focused.

## Environment & Server Execution Rules
- **Never Run Node.js Locally:** Never run `node`, `npm`, `npx`, or local dev servers on the local machine.
- **Run on Whatbox Server:** All Node.js commands, tests, builds, and migrations are executed on Whatbox (`venus.whatbox.ca`).
- **Sandbox Testing:** Use isolated sandbox directories (`~/.tmp/palate_test_sandbox`) on Whatbox when running test suites and builds during development so production environments are unaffected.

## Completed Phases
- **Phase 6:** Vault Visualization ✅
- **Phase 7:** PostgreSQL Concurrency-Safe Rate Limiter (v1.5.1) ✅
- **Phase 8:** Release v1.5.11 (Exclusive Jellyfin Auth, Cron/CSRF Remediation, Kitchen Hardening, Key Separation) [IN PROGRESS - READY FOR OPERATOR REVIEW]
