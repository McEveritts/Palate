# Track 3: Meta-AI Prompts for Calendar Integration
**Author:** Sage 🌿 — Principal Software Architect  
**Purpose:** Meta-Prompts for Gemini 3.1 Pro Deep Think / Deep Research sessions to design lightweight, high-reliability execution pipelines for the underlying Gemma-4-31b-it model.

---

## 🛠️ Prompt 1: Calendar Function Schema Architect (Tool-Calling)

Copy and paste this prompt into your Gemini 3.1 Pro session to design the exact function calling structure.

```markdown
[ROLE & CONTEXT]
You are a Principal AI Architect designing a calendar integration system for a multi-tenant Next.js 16/React 19 application. The client model is Gemma-4-31b-it, which has moderate tool-calling capability. We must design a robust, failsafe set of tool declarations (JSON Schema) that allows Gemma-4-31b-it to schedule, fetch, move, or cancel meal plans without syntax errors or hallucinated parameters.

The database schema is Prisma managed:
```prisma
model ScheduledMeal {
  id            String   @id @default(cuid())
  userId        String
  recipeId      String
  date          DateTime // Specific day
  mealType      String   // 'Breakfast', 'Lunch', 'Dinner', 'Snack'
  plannedYield  Float    @default(1.0)
}
```

[THE TASK]
Generate:
1. The exact Google Generative AI FunctionDeclarations in TypeScript for:
   - `schedule_meal`: Add a recipe to a specific date/meal type.
   - `get_scheduled_meals`: Fetch meal plans for a specific date range.
   - `move_scheduled_meal`: Relocate a scheduled meal to a new date or meal type.
   - `cancel_scheduled_meal`: Remove a scheduled meal from the calendar.
2. A compact, zero-shot system instruction segment for Gemma-4-31b-it detailing *how* to invoke these tools, including explicit examples of complex command combinations (e.g., "Move Tuesday's lunch to Friday's dinner").
3. A defensive strategy to prevent Gemma-4-31b-it from calling tools with invalid date formats (e.g., passing relative terms like "tomorrow" instead of an ISO string).

[OUTPUT PROTOCOLS]
Ensure all function parameters are strongly typed and well-described. Rely strictly on ISO 8601 YYYY-MM-DD formats.
```

---

## 📅 Prompt 2: Temporal Natural Language Resolver

Copy and paste this prompt into your Gemini 3.1 Pro session to architect the timezone-aware date resolver.

```markdown
[ROLE & CONTEXT]
You are an expert in Computational Linguistics and AI Orchestration. In our culinary assistant application (Palate), a user communicates in natural language (e.g., "Put the Lamb Tagine on dinner for next Tuesday").
To schedule this, the underlying model (Gemma-4-31b-it) needs to resolve these relative time terms into precise ISO dates.

We are establishing a dual-model pipeline:
1. Gemini 3.1 Pro provides high-level reasoning and designs the temporal mapping logic.
2. Gemma-4-31b-it executes the mapping with low latency.

[TEMPORAL CONTEXT]
Today's Date/Time Context:
- Local Time: Wednesday, May 20, 2026, 3:05:05 PM EDT
- ISO Offset: 2026-05-20T15:05:05-04:00

[THE TASK]
Create a highly engineered System Prompt segment for Gemma-4-31b-it that guarantees 100% accurate temporal resolution relative to "Wednesday, May 20, 2026".

It must define strict rules for:
1. **Relative Days**: "today", "tomorrow", "yesterday".
2. **Weekly Days**: "this Thursday", "next Tuesday", "Friday night", "this weekend".
3. **Boundary Transitions**: If today is Wednesday, does "next Tuesday" mean May 26 or June 2? Define the boundary clearly (e.g., "next X" refers to the X occurring in the following calendar week starting on Monday).
4. **Time of Day to MealType mapping**:
   - Morning/Before 10:00 -> "Breakfast"
   - 11:30 to 14:00 -> "Lunch"
   - 17:30 to 21:00 -> "Dinner"
   - Off-hours -> "Snack"

[OUTPUT PROTOCOLS]
Format the output as a Markdown instruction block ready to be appended to the Gemma-4 system prompt, followed by 5 challenging evaluation test cases showing inputs and expected ISO-resolved outputs.
```

---

## ⚖️ Prompt 3: Just-In-Time Portion & Macro Scaler

Copy and paste this prompt into your Gemini 3.1 Pro session to design the portion and macro scaling pipeline.

```markdown
[ROLE & CONTEXT]
You are a Food Scientist and Mathematical AI Engineer. In Palate, recipes have a database-defined baseline serving size and yield (e.g., "Serves 4"), and a set of macronutrients (e.g., "Protein: 40g | Carbs: 20g | Fat: 15g" - representing the macros of the standard portion).

When a user schedules a meal, they specify a `plannedYield` representing how many portions they are personally consuming (e.g., if a recipe serves 4 and they eat 1 portion, the `plannedYield` is 0.25).
We need Gemma-4-31b-it to calculate and output adjusted macros on-the-fly when scaling recipes.

[THE TASK]
Design a robust prompt template and few-shot examples for Gemma-4-31b-it to:
1. Parse the base macros (regardless of whether they are formatted as standard JSON or inline strings like "Calories: 450 | Protein: 30g").
2. Calculate the exact mathematical adjustment based on `plannedYield`.
3. Format the response dynamically, outputting BOTH the base recipe portion size, the scaled portion size, and the adjusted macros.
4. Keep math deterministic: Avoid rounding drifts (e.g., 30g * 0.33 should be 9.9g or rounded cleanly to 1 decimal place).

[OUTPUT PROTOCOLS]
Include a strict structural instruction and 3 diverse training examples (e.g., scaling up for a dinner party of 8, scaling down to a single portion of a large family meal, and handling metric/imperial conversions).
```
