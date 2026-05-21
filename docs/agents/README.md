# Palate 🌿 Custom Agent Team Registry

This directory contains the custom, production-ready configurations for the specialized **Palate Agent Team** subagents. By checking these JSON definitions into the project codebase, the team is fully version-controlled and instantly bootable in any future or existing chat thread.

## 👥 Meet the Team

| Agent Name | Role | Core Domain & Focus | Key Files Managed |
| :--- | :--- | :--- | :--- |
| **`palate-ui`** | **UI/UX Engineer** | AetherFlow Glassmorphism, Framer Motion animations, Tailwind 4, React 19 visual design, responsive layouts. | `src/app/globals.css`, `layout.tsx`, `Sidebar.tsx`, `VaultCockpit.tsx`, `SynergyCanvas.tsx`, `CalendarView.tsx`, `SageHero.tsx` |
| **`palate-sage`** | **AI/Sage Engineer** | Gemini/Gemma dual-model coordination, system prompts, stream endpoints, tool-calling pipelines, temporal resolution. | `src/lib/sage.ts`, `calendarAgent.ts`, `synergyEngine.ts`, `idfFilter.ts`, `symbolicMath.ts`, `api/sage/` |
| **`palate-data`** | **Data/Backend Engineer** | Prisma 7.8, PostgreSQL schema, Dual-mode (DB/Filesystem) CRUD operations, Google Calendar OAuth/Sync, security checks. | `prisma/schema.prisma`, `src/app/actions.ts`, `googleCalendar.ts`, `vaultParser.ts`, `vault/`, `encryption.ts` |
| **`palate-test`** | **QA/Test Engineer** | Vitest, unit/integration testing suite, OWASP security audits, build validation, typecheck enforcement, accessibility audits. | `vitest.config.ts`, `vitest.setup.ts`, `src/lib/*.test.ts`, `tests/` |

***

## 🚀 Loading the Team in a New or Resumed Chat

Subagent registrations (`define_subagent` calls) are scoped to the conversation thread. If you start a **brand-new chat session** or resume an **existing older chat**, the active assistant can instantly boot the entire team in a single turn.

### The Single-Turn Activation Command

To spin up the entire team in any chat thread, copy and send this message to the assistant:

> "Please read the custom agent configurations in `docs/agents/` and register my specialized palate subagents using the `define_subagent` tool."

The AI assistant will read the JSON files in this directory and define them instantly, adding them to its active subagent sidebar and allowing you to invoke them for target operations.
