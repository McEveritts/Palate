<div align="center">

# 🍽️ Palate

**Your AI Sous-Chef**

[![Version](https://img.shields.io/badge/Version-1.0.0-fuchsia.svg?style=for-the-badge)](https://github.com/McEveritts/Palate)
[![Next.js](https://img.shields.io/badge/Next.js-14-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Framer Motion](https://img.shields.io/badge/Framer_Motion-0055FF?style=for-the-badge&logo=framer&logoColor=white)](https://www.framer.com/motion/)

*Culinary intelligence meets deep glassmorphism. Synthesize, optimize, and execute.*

</div>

---

## 🌟 Overview

**Palate** is a high-end, AI-powered culinary companion designed for those who treat cooking as both an art and a science. It leverages the **SageAI** persona—a MasterChef-style editorial intelligence—to transform raw ingredients, scattered ideas, and nutritional goals into structured, executable recipes. 

Featuring a deep glassmorphism UI, fluid `framer-motion` transitions, and strict `Cooklang` markdown parsing, Palate is built to be the ultimate local recipe vault and culinary assistant.

---

## ✨ Core Features

### 🧠 SageAI Intelligence
*   **The MasterChef Persona:** SageAI communicates through a structured 4-phase narrative (Hook, Bridge, Thesis, Transition), providing rich, sensory-specific guidance.
*   **Zero-Waste Engine:** A specialized chat UI powered by Gemma 4 (31B) designed exclusively to clear your pantry. Input what you have; output a cohesive meal.

### 🏛️ The Recipe Vault
*   **Markdown & Cooklang Native:** Recipes are stored locally in markdown, utilizing Cooklang syntax (`@ingredient`, `#cookware`) for precise parsing.
*   **In-Page Fluid Modals:** Seamlessly browse your synthesized creations. Recipes expand into elegant, readable overlays without aggressive page routing.

### ⚖️ Smart Collections
*   **Macro-Optimized:** Your entire vault, automatically parsed and sorted by protein-to-calorie density. Instantly view Carbs, Fat, Protein, and Calories on sleek, interactive cards.
*   **Curated by Sage:** Chronological meal groupings (Main + Sides) for complete culinary experiences.

### 🎨 AetherFlow Aesthetics
*   **Deep Glassmorphism:** Layered `backdrop-blur` panels, saturated gradients, and neon accents.
*   **Interactive Polish:** Every interaction is smoothed with Framer Motion layout animations and custom scrollbars.

---

## 🚀 Tech Stack

*   **Framework:** Next.js (App Router)
*   **Language:** TypeScript
*   **Styling:** Tailwind CSS
*   **Animations:** Framer Motion
*   **State Management:** Zustand
*   **AI Integration:** Gemini 3.1 Pro & Gemma 4 (31B/26B MoE)
*   **Markdown Parsing:** ReactMarkdown + remark-gfm
*   **Testing:** Vitest

---

## 📦 Getting Started

1. **Clone the repository:**
   ```bash
   git clone https://github.com/McEveritts/Palate.git
   cd Palate
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Run the development server:**
   ```bash
   npm run dev
   ```

4. **Access the application:**
   Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📂 Project Structure

```text
Palate/
├── src/
│   ├── app/                      # Next.js App Router (Pages & APIs)
│   │   ├── api/                  # AI synthesis and parsing endpoints
│   │   ├── collections/          # Smart Collections (Macro, Zero-Waste)
│   │   ├── plans/                # Curated by Sage views
│   │   └── vault/                # Recipe Vault views
│   ├── components/               # React Components
│   │   ├── layout/               # Sidebar & Navigation
│   │   ├── collections/          # MacroGrid UI
│   │   └── vault/                # Vault filters & grids
│   └── lib/                      # Utilities & Parsers
│       ├── sage.ts               # SageAI logic
│       ├── parser.ts             # Cooklang & Markdown parsing
│       └── vaultParser.ts        # File system vault interactions
├── vault/                        # Local Markdown Recipe Storage
│   ├── curated/
│   ├── mains/
│   └── sides/
├── tests/                        # Vitest Test Suites
└── public/                       # Static Assets & Icons
```

<div align="center">
  <p><i>Bon Appétit.</i></p>
</div>