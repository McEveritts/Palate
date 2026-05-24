# Google GenAI SDK — Interactions API Breaking Change

> **Saved:** 2026-05-23  
> **Deadline:** May 26, 2026 (legacy removed June 8, 2026)  
> **Palate Status:** ✅ NOT AFFECTED (uses `generateContent` endpoint)

---

## Summary

The unified Google GenAI SDK (`from google import genai`) is changing its
`interactions` API response schema. The top-level `outputs` property is being
renamed to `steps`.

| Date | Event |
|------|-------|
| **May 26, 2026** | `outputs` deprecated; `steps` becomes the standard |
| **June 8, 2026** | `outputs` completely removed from the gateway |

---

## Who Is Affected

### 🟢 Scenario A: `client.interactions.create()` — **AFFECTED**

If you use the new unified SDK and call the model via the `interactions` method,
your response parsing code **will break** on May 26 unless updated.

The change is actually beneficial for models with native reasoning/thinking
(like `gemma-4-31b-it`). Under the new schema, the API maps Gemma's internal
thinking tokens into structured `steps`:

- A discrete **thought** step block
- Followed by a **model_output** step block

#### Migration Example

```python
from google import genai

client = genai.Client()

interaction = client.interactions.create(
    model="gemma-4-31b-it",
    input="Analyze this routing logic anomaly..."
)

# ❌ LEGACY (Broken after May 26 / Removed June 8):
# print(interaction.outputs[0].text)

# ✅ NEW STANDARD:
# Grabs the final 'model_output' text step, skipping internal 'thought' steps
print(interaction.steps[-1].content[0].text)
```

### ⚪ Scenario B: `model.generateContent()` — **NOT AFFECTED**

Applications using the legacy/standard content generation endpoints:
- `client.models.generate_content()`
- Direct POST to `/v1beta/models/<model>:generateContent`
- JS SDK `@google/generative-ai` → `model.generateContent()`

These use the traditional `candidates[]` array structure (not the agentic
`outputs` object) and will continue running normally.

---

## Palate's Current Architecture (as of v1.3.x)

Palate uses `@google/generative-ai` (JS SDK v0.24.1) with the standard
`generateContent` / `generateContentStream` endpoints exclusively.

**All call sites (Scenario B — safe):**

| File | Method | Model |
|------|--------|-------|
| `src/lib/sage.ts` → `askSage()` | `generateContent` | `gemma-4-31b-it` / `gemini-3.1-pro-preview` |
| `src/lib/sage.ts` → `streamSage()` | `generateContentStream` | `gemma-4-31b-it` / `gemini-3.1-pro-preview` |
| `src/lib/calendarAgent.ts` | `generateContent` | `gemma-4-31b-it` |
| `src/app/api/curate/route.ts` | `generateContent` | `gemma-4-31b-it` |
| `src/app/api/household/suggest-name/route.ts` | `generateContent` | `gemma-4-31b-it` |
| `src/app/api/nutrition/route.ts` | `generateContent` | `gemma-4-31b-it` (USDA fallback) |
| `src/app/api/parse/route.ts` | `generateContent` | `gemma-4-31b-it` |
| `src/app/api/sage/zero-waste/route.ts` | `generateContentStream` | `gemma-4-31b-it` |

---

## Future Migration Notes

If Palate ever migrates to the unified `genai` SDK and the `interactions` API
(e.g., for richer agentic tool-calling flows or to leverage native structured
thinking steps from Gemma 4):

1. **Response parsing** must use `.steps[-1].content[0].text` (not `.outputs[0].text`)
2. **Thinking/reasoning** will arrive as separate step objects, enabling
   structured access to Gemma's `<thought>` blocks at the API level
3. The Calendar Agent's tool-calling loop would be the most natural candidate
   for migration, since `interactions` natively supports multi-turn tool
   execution

---

## Action Item Checklist

- [x] Audit all Palate call sites — confirmed all use `generateContent` ✅
- [ ] *(Future)* Evaluate migrating Calendar Agent to `interactions` API
- [ ] *(Future)* Evaluate migrating `streamSage()` to `interactions` for
      structured thinking step access
