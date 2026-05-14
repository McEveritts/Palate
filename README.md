<div align="center">
  <img src="public/assets/logos/palate-logo.svg" alt="Palate Logo" width="120" />
  <h1>Palate - Your AI Sous-Chef</h1>
  <p><b>A local-first AI recipe engine and culinary intelligence platform, powered by Gemini.</b></p>

  [![Next.js](https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
  [![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-06B6D4?style=for-the-badge&logo=tailwind-css)](https://tailwindcss.com/)
  [![Gemini](https://img.shields.io/badge/Gemini_AI-Pro-1A73E8?style=for-the-badge&logo=google)](https://aistudio.google.com/)
  [![License](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)](LICENSE)
</div>

---

## 🌟 Overview

**Palate** is a modern, privacy-focused recipe management application designed to elevate your home cooking. Instead of relying on static cloud databases, Palate stores your recipes entirely locally as flat Markdown files. At its core is **Sage**, your AI Sous-Chef, built on top of the powerful Google Gemini AI model. Sage doesn't just look up recipes; it parses them, modifies them, understands your pantry, and helps you optimize your nutrition.

## ✨ Features

- 💬 **Ask Sage:** A conversational AI interface that crafts, extracts, and modifies recipes on the fly. Whether you want to "make it spicier," "substitute the dairy," or "extract a recipe from this YouTube link," Sage handles it.
- 🗄️ **The Vault:** Local recipe storage using standard Markdown with [Cooklang](https://cooklang.org/) support. Recipes are automatically parsed for ingredients, scalable measurements, and step-by-step instructions.
- 🧠 **Smart Collections:**
  - 🏋️‍♂️ **Macro-Optimized:** Automatically sorts and filters your recipe vault by protein density and caloric efficiency using TTL-optimized in-memory caching.
  - 🍃 **Zero-Waste:** A specialized pantry-clearing AI stream. Tell Sage what leftovers you have, and it will generate a bespoke recipe strictly utilizing those ingredients.
- 🔐 **Secure & Private:**
  - **Bring Your Own Key (BYOK):** Your Gemini API key is stored securely in your browser's `localStorage` and never transmitted to our servers.
  - **Guest Mode:** Try the app instantly without an account, completely isolated from cloud sync.
  - **Google Auth:** Sign in via NextAuth.js to sync your settings and unlock the full vault.

## 🛠️ Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Styling:** Tailwind CSS v4 + Framer Motion (Glassmorphism UI)
- **AI Integration:** `@google/generative-ai` SDK
- **State Management:** Zustand (with local storage persistence)
- **Authentication:** NextAuth.js (Google Provider)
- **Testing:** Vitest + React Testing Library

## 🚀 Getting Started

### Prerequisites

- Node.js (v18+)
- A [Google Gemini API Key](https://aistudio.google.com/app/apikey)
- Google OAuth Credentials (Client ID & Secret for NextAuth)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/palate.git
   cd palate
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment variables:**
   Create a `.env.local` file in the root directory:
   ```env
   # Required for Authentication
   GOOGLE_CLIENT_ID="your_google_client_id"
   GOOGLE_CLIENT_SECRET="your_google_client_secret"
   NEXTAUTH_SECRET="your_random_secret_string"
   NEXTAUTH_URL="http://localhost:2814"
   
   # Optional: System-level AI fallback (Not required if users provide their own key in Settings)
   GEMINI_API_KEY="your_gemini_api_key"
   ```

4. **Run the development server:**
   ```bash
   npm run dev
   ```
   *Note: Palate is explicitly configured to default to port 2814.*

5. **Open Palate:**
   Navigate to [http://localhost:2814](http://localhost:2814) in your browser.

## 🧪 Testing

Palate uses Vitest for rapid, reliable unit testing. To run the test suite:

```bash
npm run test
```

## 📂 Architecture & Data Flow

Unlike traditional CRUD apps, Palate leans heavily into the local filesystem. Recipes are saved as `.md` files in the `src/vault` directory. The application uses a custom Markdown parser that extracts frontmatter (YAML) for metadata (macros, tags, categories) while utilizing Cooklang regex to highlight ingredients and cookware within the instructional text dynamically.

Because the app is local-first, the middleware is strictly set up to protect sensitive routes (`/plans`, `/vault`, `/collections`) while allowing the core AI chatting functionality to remain locally isolated in Guest Mode.

## 🤝 Contributing

We welcome contributions! Please feel free to submit a Pull Request. Make sure to run `npm run test` and `npm run lint` before submitting.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
