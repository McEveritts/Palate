<div align="center">
  <img src="public/assets/logos/palate-logo.svg" alt="Palate Logo" width="140" />
  <h1>Palate 🌿</h1>
  <p><b>An Elite, Local-First Spatial Culinary & Holistic Wellness Intelligence Platform</b></p>

  [![Next.js](https://img.shields.io/badge/Next.js-16.2.6-black?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org/)
  [![React](https://img.shields.io/badge/React-19.2.4-blue?style=for-the-badge&logo=react)](https://react.dev/)
  [![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4.0-06B6D4?style=for-the-badge&logo=tailwindcss)](https://tailwindcss.com/)
  [![Prisma](https://img.shields.io/badge/Prisma-7.8.0-2D3748?style=for-the-badge&logo=prisma)](https://www.prisma.io/)
  [![Gemini](https://img.shields.io/badge/Gemini_AI-3.1-1A73E8?style=for-the-badge&logo=google&logoColor=white)](https://aistudio.google.com/)
  [![Gemma](https://img.shields.io/badge/Gemma-4--31B--IT-8B5CF6?style=for-the-badge&logo=google-cloud)](https://github.com/google/gemma-pytorch)
</div>

---

## 🥗 The Vision

**Palate** is a premium, privacy-respecting local-first culinary companion and metabolic coach designed for spatial, fluid interaction. Unlike corporate meal plan services that lock your cooking history into proprietary cloud databases, Palate stores your entire recipe catalogue as flat Markdown files using the open-standard **Cooklang** specification. 

At the core of the platform is **Sage (🌿)**—your digital sous-chef and metabolic assistant. Sage operates under a specialized dual-model architecture, leveraging reinforcement-learning aligned **Gemma-4-31B-IT** alongside **Gemini 3.1 Pro** to parse ingredients, scale recipe chemistry, calculate USDA-grounded nutritional vectors, and analyze athletic training telemetry. Wrapped in the stunning, spatial **AetherFlow** glassmorphic interface, Palate is built to deliver a premium, fluid experience across browsers, tablets, and standalone PWA environments.

---

## ✨ Key Platform Pillars

### 🌿 1. Sage AI Dual-Model Orchestration & RLAIF/DPO Alignment
- **Gemma-4-31B-IT + Gemini 3.1:** Sage splits its cognitive load. General routing, visual plates scanning, and fast culinary scaling are handled by Gemini 3.1 Flash-Lite, while complex physiological metabolic reasoning is executed by a locally-tailored Gemma-4-31B-IT instance.
- **Strict Thought Separation:** Aligned with a custom **RLAIF (Reinforcement Learning from AI Feedback)** and **DPO (Direct Preference Optimization)** framework. The model conducts mathematical macro target calculations, Vault cross-referencing, and recovery logic exclusively inside isolated `<thought>` logs.
- **Decoupled Wellness & Zero-Waste Paths:** Tailored system instructions allow the **Holistic Wellness Coach** and **Zero-Waste Pantry Specialist** to run on isolated endpoints, completely bypassing the culinary domain restrictions of the standard Ask Sage chat interface to prevent false-positive prompt injection slips.

### 🗄️ 2. Flat Markdown Vaults with Cooklang AST Scalers
- **Local-First Ownership:** Your mains, sides, and snacks are stored in flat directories (`vault/mains/`, `vault/sides/`).
- **Cooklang AST Compilation:** Palate parses Cooklang syntax (`@lamb{300%g}`, `#pan`, `~simmering{10%min}`) into a highly navigable Abstract Syntax Tree (AST), enabling real-time, mathematically precise scaling of ingredients and instructions without round-trip database queries.

### 🏋️‍♂️ 3. Physiological Telemetry & USDA Caching
- **14-Day Exercise Telemetry:** Integrates directly with a local database tracking daily active energy expenditures, session frequencies, and Cardio vs. Strength balance.
- **Dietary Pattern Analysis:** Recognizes behavioral trends (such as detraining, maintenance, or progressive load) and aligns metabolic post-workout recovery prescriptions using a logistic Sigmoid strain coefficient.
- **Deterministic USDA Macro Lookups:** Accesses the **USDA FoodData Central API** via custom local cache adapters. Hallucinated macro values are strictly forbidden; any non-USDA macro estimate is explicitly labeled as `(Estimated)` to ensure absolute nutritional integrity.

### 📱 4. Multi-Platform PWA with Camera Fallbacks
- **Full Offline App Shell:** Optimized with a robust Serwist-powered Service Worker and strict display manifest configurations.
- **PWA Standalone Camera Fallback:** To overcome Apple WebKit's standalone PWA WebRTC limitations (where `getUserMedia` streams are blocked), Palate elegantly morphs its scanner viewport into an interactive **PWA Camera Mode**, launching the native OS camera and photo roll for seamless plate uploads with 100% reliable functionality.

---

## 🛠️ Tech Stack

- **Core Framework:** Next.js 16.2.6 (App Router with Turbopack)
- **Component Engine:** React 19.2.4 (Strict Concurrent Mode)
- **Styling System:** Tailwind CSS v4 + Framer Motion 12 (Glassmorphism & Radial Specular highlights)
- **Data & Schema Layer:** Prisma ORM 7.8.0 + PostgreSQL 16 (local or connection pooled)
- **AI Integrations:** Google Generative AI SDK, USDA FoodData Central REST API
- **Auth Engine:** NextAuth.js (Secure Google OAuth)
- **Cryptographic Security:** AES-256-GCM symmetric encryption for client API key vaulting
- **Testing:** Vitest 4.1.6 + React Testing Library (113/113 full suite coverage)

---

## 📂 Architecture & Directory Organization

```
├── prisma/
│   └── schema.prisma           # Prisma PostgreSQL schema
├── public/
│   └── assets/                 # SVGs, icons, and premium UI assets
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── diary/          # Daily food consumption database routes
│   │   │   ├── food-search/    # UPC and ingredient lookup services
│   │   │   ├── nutrition/      # USDA macro queries & cached indexing
│   │   │   ├── sage/
│   │   │   │   ├── meal-scan/  # Vision-based macro plate estimation
│   │   │   │   ├── wellness/   # Decoupled fitness telemetry parser
│   │   │   │   └── zero-waste/ # Pantry clearing recipe synthesis
│   │   │   └── weight/         # Anthropometric logging endpoints
│   │   ├── collections/        # Macro-Optimized & Zero-Waste landing grids
│   │   └── Diary/              # High-fidelity calorie diary clients
│   ├── components/
│   │   ├── collections/        # Smart grid collection cards
│   │   ├── fitness/            # MealScanner & BarcodeScanner dialog controllers
│   │   ├── layout/             # Glassmorphism panels and dynamic docks
│   │   └── zero-waste/         # Drag-and-drop leftover selector UI
│   ├── lib/
│   │   ├── auth.ts             # NextAuth Google OAuth configuration
│   │   ├── db.ts               # Local Prisma Client singleton
│   │   ├── encryption.ts       # Cryptographic AES-256-GCM adapters
│   │   ├── idfFilter.ts        # Inverse Document Frequency retrieval engine
│   │   ├── lexicalCompressor.ts # Lexical context window compressors
│   │   ├── macroCache.ts       # USDA offline lookup caching system
│   │   ├── parser.ts           # Streaming thought and markdown parsers
│   │   ├── patternAnalysis.ts  # Dietary behavioral analytics engine
│   │   ├── symbolicMath.ts     # Formula parsing & Cooklang AST multipliers
│   │   ├── synergyEngine.ts    # Synergistic nutrient mapping algorithms
│   │   ├── vault.ts            # Flat-file filesystem read-writes
│   │   └── vaultParser.ts      # Markdown-YAML and Cooklang regex compiling
│   └── types/                  # Shared typings
└── vault/
    ├── mains/                  # Flat Cooklang Markdown files (Mains)
    ├── sides/                  # Flat Cooklang Markdown files (Sides)
    └── macros/                 # USDA local indexing database imports
```

---

## 🧬 Database Schema Overview

```mermaid
erDiagram
    Household ||--o{ User : contains
    Household ||--o{ Recipe : catalog
    User ||--o{ ChatSession : logs
    ChatSession ||--o{ ChatMessage : streams
    User ||--o{ ScheduledMeal : plans
    Recipe ||--o{ ScheduledMeal : target
    User ||--|| UserProfile : biometric
    User ||--|| UserConfig : security
    User ||--o{ DailyLog : diary
    DailyLog ||--o{ FoodLogEntry : tracking
    DailyLog ||--o{ ExerciseLogEntry : telemetry
    DailyLog ||--o{ WaterLogEntry : hydration
```

### Key Data Entities
1. **UserConfig:** Holds AES-256-GCM encrypted Google Gemini keys alongside the metric-to-imperial preference toggles.
2. **Recipe:** Stores raw Markdown, parsed YAML frontmatter, Cooklang AST syntax maps, and cached nutrient vectors.
3. **ScheduledMeal:** Implements a Directed Acyclic Graph (DAG) using `parentMealId` relationships, letting the system trace batch-cooking lifecycles and leftover consumption schedules.
4. **DailyLog:** Represents a secure temporal database logging water intake, raw calorie aggregates, high-resolution food consumption snapshots, and physical training items.

---

## 🚀 Local Development Setup

### 1. Clone the Repository
```bash
git clone https://github.com/McEveritts/Palate.git
cd Palate
```

### 2. Configure Your Environment (`.env.local`)
Create a `.env.local` file in the root directory:
```env
# Database Settings (Local Docker PostgreSQL)
DATABASE_URL="postgresql://postgres:postgres@localhost:28015/palate?schema=public"

# Auth Credentials (Google Developer Console)
GOOGLE_CLIENT_ID="xxx.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="GOCSPX-xxx"
NEXTAUTH_SECRET="your-symmetric-jwt-encryption-key"
NEXTAUTH_URL="http://localhost:28014"

# Global System Key (Fallback for guests or missing settings)
GEMINI_API_KEY="AIzaSyxxx"
```

### 3. Spin Up Local PostgreSQL Services
Ensure Docker is installed and running. Start a local Postgres container isolated to Palate's ports:
```bash
docker run --name palate-db -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=palate -p 28015:5432 -d postgres:16
```

### 4. Database Setup & Migrations
Sync the database schema using Prisma:
```bash
npx prisma db push
```

### 5. Install Dependencies & Build Client
```bash
npm install
npx prisma generate
```

### 6. Run the Development Server
```bash
npm run dev
```
Palate will launch on its custom developer port: [http://localhost:28014](http://localhost:28014).

---

## 📊 Environment Reference Guide

| Variable | Scope | Description |
| :--- | :--- | :--- |
| `DATABASE_URL` | **Required** | PostgreSQL connection string including schema mapping. |
| `GOOGLE_CLIENT_ID` | **Required** | OAuth Client ID for NextAuth Google login. |
| `GOOGLE_CLIENT_SECRET` | **Required** | OAuth Client Secret for NextAuth Google login. |
| `NEXTAUTH_SECRET` | **Required** | Symmetrical hash key used to encrypt user JWT cookies. |
| `NEXTAUTH_URL` | **Required** | Absolute base URL of the active deployment. |
| `GEMINI_API_KEY` | *Optional* | Fallback system key for processing guest requests. |

---

## 🛠️ CLI Operations Manual

| Script | Purpose |
| :--- | :--- |
| `npm run dev` | Starts the Next.js development server on local port `28014`. |
| `npm run build` | Compiles an optimized Next.js production build using Webpack. |
| `npm run start` | Launches the compiled Next.js production web server on port `28014`. |
| `npm run test` | Executes the complete Vitest automated test suite. |
| `npx prisma studio` | Launches an interactive database dashboard on port `5555`. |

---

## 🧪 Testing Protocol

Palate enforces strict test-driven engineering. The test suite covers symbolic scales, lexical compressions, grey-matter frontmatter compilations, and stream parsing patterns.

To run the automated suite:
```bash
npm run test
```

### Mocking Generative Engines
Test integrations mock standard Google Generative AI streaming returns, allowing offline verification of the stream parsing loops:
```typescript
import { parseSageStream } from '@/lib/parser';

describe('Gemma-4 Stream Parsing', () => {
  it('should split thoughts and content dynamically', () => {
    const raw = "<thought>\nCalculating leucine triggers.\n</thought>\n# Salmon";
    const result = parseSageStream(raw, true);
    expect(result.thoughts).toBe("Calculating leucine triggers.");
    expect(result.content).toBe("# Salmon");
  });
});
```

---

## 🚀 Production Deployment & Server Maintenance

Palate is running in production on a dedicated Linux instance (`pomelo.whatbox.ca`).

### Automatic Deployment Pipeline
We utilize an automated SSH deployment pipeline configured in `quick_deploy.py`:
```bash
python quick_deploy.py
```
This script automates the complete server-side build cycle:
1. Performs a hard reset of local modifications on the production branch: `git reset --hard origin/master`
2. Pushes the database schema: `npx prisma db push`
3. Installs dependencies and regenerates the Prisma Client.
4. Compiles the optimized Next.js application bundle.
5. Soft-terminates active servers and re-binds screen instances:
   ```bash
   screen -X -S palate quit || true
   screen -dmS palate bash -c "/home/betheenvy/start_palate.sh"
   ```
6. Runs a verification health check against the local web proxy.

---

## 💡 Troubleshooting

### PWA Standalone Camera Mode Access
- **Issue:** Viewfinder displays black screen with blank camera on iOS standalone launch.
- **Solution:** This is due to WebKit revoking WebRTC `getUserMedia` access in standalone PWAs. The viewport will automatically present the **PWA Camera Mode Fallback**. Simply **tap anywhere on the viewport** to invoke native device captures.

### Prisma Client Target Out-of-Sync
- **Issue:** Type-checking errors due to schema modifications in local models.
- **Solution:** Force sync and re-generate local definitions:
  ```bash
  npx prisma db push && npx prisma generate
  ```

### Mismatched Symmetric Master Key
- **Issue:** Encrypted API keys in the database fail integrity check on load (`InvalidMessage` error).
- **Solution:** Verify that your `NEXTAUTH_SECRET` environment variable in your production configuration matches the exact symmetrical master key utilized during initial database encryption.

---

## 📄 License
This platform is open-source software licensed under the [MIT License](LICENSE).
