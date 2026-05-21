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
- **AI Orchestration:** Dual-model (Gemini 3.1 Flash-Lite as router/interface; Gemini 3.1 Pro for complex reasoning).
- **Data Layer:** Local-first Markdown vault (`vault/mains/`, `vault/sides/`) using Cooklang and YAML frontmatter.
- **External Integration:** USDA FoodData Central via MCP for deterministic nutritional accuracy.

## Design System (AetherFlow)
- **Style:** Extreme Glassmorphism. 24-48px backdrop blur, dark slate theme, glowing indigo/fuchsia radial orbs, specular edge highlights.
- **Typography:** Inter font; `.prose` class includes `text-shadow` for glowing emojis and text.
- **Hydration:** `suppressHydrationWarning` applied to `layout.tsx` to prevent mismatches from browser extensions (e.g., Dark Reader).

## Versioning & Releases
- **Current Version:** 1.3.x series.
- **Increment Rule:** Each commit/release bumps the **patch** version by `0.0.1` (e.g., `1.3.1` → `1.3.2` → `1.3.3`).
- **Git Tags:** Create an annotated tag (`v1.3.x`) for each release and push it to origin.
- **package.json:** Update the `"version"` field in `package.json` to match the new patch version before committing.

## Completed Phases
- **Phase 6:** Vault Visualization ✅
