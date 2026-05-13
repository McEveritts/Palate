# Tech Stack

## 1. Framework & UI
- Next.js 16.2.6 (with Turbopack)
- React 19.2.4
- Tailwind CSS 4 (along with the Typography plugin)
- Framer Motion 12 (for micro-animations and dynamic UI transitions)
- Lucide React (for iconography)

## 2. AI Orchestration
- **Default Model:** `gemini-3-flash-preview`
  - Used as the primary engine for culinary reasoning, meal planning, and interface handling.

## 3. Data Layer
- **Local-First Markdown Vault:** Stored locally (e.g., `vault/mains/`, `vault/sides/`).
- **Cooklang:** Used for recipe markup.
- **YAML Frontmatter:** For managing metadata within the markdown recipes.

## 4. External Integrations
- **USDA FoodData Central (via MCP):** Used to pull deterministic and highly accurate nutritional data for your ingredients and recipes.

## 5. Design System (AetherFlow)
- **Styling Theme:** Extreme Glassmorphism (24-48px backdrop blur) with a dark slate theme, specular edge highlights, and a glowing indigo/fuchsia aurora.
- **Typography:** Inter font, with a `.prose` class that applies text-shadow for glowing emojis and text.