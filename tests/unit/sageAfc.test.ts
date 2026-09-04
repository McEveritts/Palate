import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  AsyncQueue,
  ThoughtDemarcator,
  createSageCallableTool,
  executeSageToolCalls,
  streamSage,
  SageCallableToolOptions,
  getIngredientsMacrosSchema,
  logFoodConsumptionSchema,
  logExerciseSchema,
  logHydrationSchema,
  logWeightSchema,
  LOGGING_INTENT_REGEX,
  resolveSageIntent,
  calculateAtwaterCalories,
  fetchMacros,
} from '@/lib/sage';
import { FunctionCall, ThinkingLevel } from '@google/genai';

vi.mock('@/lib/macroCache', () => ({
  globalMacroCache: {
    get: vi.fn().mockReturnValue([
      {
        ingredient_matched: 'Ground Lamb',
        calories: '282.0',
        protein: '16.56',
        carbs: '0.00',
        fat: '23.41',
        fiber: '0.00',
        sugar: '0.00',
        sodium: '72.0',
        common_portions: '100g (100.0g)',
        status: 'Success (per 100g)',
      },
    ]),
    invalidate: vi.fn(),
  },
}));

vi.mock('@/lib/patternAnalysis', () => ({
  analyzeDietaryPatterns: vi.fn().mockResolvedValue({
    calorieAdherence: 95,
    proteinAdherence: 92,
    avgDailyCalories: 1950,
  }),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    userProfile: {
      findUnique: vi.fn().mockResolvedValue({
        targetCalories: 2100,
        targetProtein: 160,
      }),
    },
  },
}));

const mockSendMessageStream = vi.fn();
const mockCreateChat = vi.fn().mockImplementation(() => ({
  sendMessageStream: (...args: any[]) => mockSendMessageStream(...args),
}));

vi.mock('@google/genai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@google/genai')>();
  return {
    ...actual,
    GoogleGenAI: class {
      chats = {
        create: (...args: any[]) => mockCreateChat(...args),
      };
      models = {
        generateContent: vi.fn().mockResolvedValue({ text: 'mock text' }),
      };
    },
  };
});

describe('Sage Native AFC & Owned Tool Orchestration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GEMINI_API_KEY = 'test-key';
  });

  describe('Tool Declarations', () => {
    it('declares all 6 tools in tool()', async () => {
      const callable = createSageCallableTool();
      const toolDecl = await callable.tool();
      const declarations = toolDecl.functionDeclarations || [];
      expect(declarations).toHaveLength(6);
      const names = declarations.map((d) => d.name);
      expect(names).toContain('get_ingredients_macros');
      expect(names).toContain('log_food_consumption');
      expect(names).toContain('log_exercise');
      expect(names).toContain('log_hydration');
      expect(names).toContain('log_weight');
      expect(names).toContain('get_fitness_summary');
    });
  });

  describe('Production Concurrency & Error Semantics (Promise.allSettled)', () => {
    it('proves concurrent execution by timing and start-order evidence on the production path', async () => {
      const events: string[] = [];

      const options: SageCallableToolOptions = {
        toolExecutors: {
          delayed_tool_1: async () => {
            events.push('tool1_start');
            await new Promise((r) => setTimeout(r, 60));
            events.push('tool1_end');
            return { result: 'one' };
          },
          delayed_tool_2: async () => {
            events.push('tool2_start');
            await new Promise((r) => setTimeout(r, 60));
            events.push('tool2_end');
            return { result: 'two' };
          },
          failing_tool: async () => {
            events.push('tool3_start');
            throw new Error('Simulated failure in sibling');
          },
        },
      };

      const calls: FunctionCall[] = [
        { id: 'call_1', name: 'delayed_tool_1', args: {} },
        { id: 'call_2', name: 'delayed_tool_2', args: {} },
        { id: 'call_3', name: 'failing_tool', args: {} },
      ];

      const startTime = Date.now();
      const results = await executeSageToolCalls(calls, options);
      const totalElapsed = Date.now() - startTime;

      // 1. Concurrency evidence: Both delayed tools started before either finished
      expect(events.indexOf('tool1_start')).toBeLessThan(events.indexOf('tool1_end'));
      expect(events.indexOf('tool2_start')).toBeLessThan(events.indexOf('tool1_end'));
      expect(events.indexOf('tool2_start')).toBeLessThan(events.indexOf('tool2_end'));

      // Total duration is well below sequential (60ms + 60ms = 120ms)
      expect(totalElapsed).toBeLessThan(110);

      // 2. Strict positional order preservation
      expect(results).toHaveLength(3);
      expect(results[0].functionResponse?.name).toBe('delayed_tool_1');
      expect(results[0].functionResponse?.id).toBe('call_1');
      expect(results[0].functionResponse?.response).toEqual({ result: 'one' });

      expect(results[1].functionResponse?.name).toBe('delayed_tool_2');
      expect(results[1].functionResponse?.id).toBe('call_2');
      expect(results[1].functionResponse?.response).toEqual({ result: 'two' });

      // 3. Error isolation: tool 3 failed gracefully without crashing sibling tools 1 and 2
      expect(results[2].functionResponse?.name).toBe('failing_tool');
      expect(results[2].functionResponse?.id).toBe('call_3');
      expect((results[2].functionResponse?.response as any).error).toContain('Simulated failure in sibling');
    });

    it('strictly preserves the positional order of incoming FunctionCalls with production tools', async () => {
      const emittedTokens: string[] = [];
      const calls: FunctionCall[] = [
        { id: 'w1', name: 'log_weight', args: { weight_kg: 75.5 } },
        { id: 'e1', name: 'log_exercise', args: { exercise_name: 'Rowing', duration_minutes: 30, calories_burned: 250 } },
        { id: 'h1', name: 'log_hydration', args: { amount_ml: 750 } },
        { id: 'm1', name: 'get_ingredients_macros', args: { ingredient_names: ['Ground Lamb'] } },
      ];

      const parts = await executeSageToolCalls(calls, {
        emitToolToken: (tok) => emittedTokens.push(tok),
      });

      expect(parts).toHaveLength(4);
      expect(parts[0].functionResponse?.name).toBe('log_weight');
      expect(parts[0].functionResponse?.id).toBe('w1');
      expect(parts[1].functionResponse?.name).toBe('log_exercise');
      expect(parts[1].functionResponse?.id).toBe('e1');
      expect(parts[2].functionResponse?.name).toBe('log_hydration');
      expect(parts[2].functionResponse?.id).toBe('h1');
      expect(parts[3].functionResponse?.name).toBe('get_ingredients_macros');
      expect(parts[3].functionResponse?.id).toBe('m1');

      expect((parts[0].functionResponse?.response as any).message).toContain('75.5 kg');
      expect((parts[1].functionResponse?.response as any).message).toContain('Rowing');
      expect((parts[2].functionResponse?.response as any).message).toContain('750ml');
      expect((parts[3].functionResponse?.response as any)['Ground Lamb']).toBeDefined();
    });

    it('handles simulated async rejection in single tool call and preserves call.id', async () => {
      const calls: FunctionCall[] = [
        { id: 'h_good', name: 'log_hydration', args: { amount_ml: 250 } },
        { id: 'inv_call', name: 'invalid_call', args: {} },
      ];

      const parts = await executeSageToolCalls(calls);
      expect(parts[0].functionResponse?.name).toBe('log_hydration');
      expect(parts[0].functionResponse?.id).toBe('h_good');
      expect((parts[0].functionResponse?.response as any).status).toBe('success');

      expect(parts[1].functionResponse?.name).toBe('invalid_call');
      expect(parts[1].functionResponse?.id).toBe('inv_call');
      expect((parts[1].functionResponse?.response as any).error).toContain('Unknown tool');
    });

    it('safely handles null or malformed elements in FunctionCall array without rejecting', async () => {
      const calls = [
        null as any,
        { id: 'call_valid', name: 'log_hydration', args: { amount_ml: 250 } },
        undefined as any,
      ];

      const results = await executeSageToolCalls(calls);
      expect(results).toHaveLength(3);
      expect(results[0].functionResponse?.name).toBe('unknown');
      expect((results[0].functionResponse?.response as any).error).toBeDefined();

      expect(results[1].functionResponse?.name).toBe('log_hydration');
      expect(results[1].functionResponse?.id).toBe('call_valid');
      expect((results[1].functionResponse?.response as any).status).toBe('success');

      expect(results[2].functionResponse?.name).toBe('unknown');
      expect((results[2].functionResponse?.response as any).error).toBeDefined();
    });

    it('handles non-array functionCalls defensively by returning empty array', async () => {
      const results = await executeSageToolCalls(null as any);
      expect(results).toEqual([]);
    });

    it('normalizes single string ingredient_names into array in get_ingredients_macros', async () => {
      const results = await executeSageToolCalls([
        { id: 'macro_call_1', name: 'get_ingredients_macros', args: { ingredient_names: 'Ground Lamb' as any } },
      ]);
      expect(results).toHaveLength(1);
      expect(results[0].functionResponse?.id).toBe('macro_call_1');
      expect((results[0].functionResponse?.response as any)['Ground Lamb']).toBeDefined();
    });
  });

  describe('Tool Argument Validation (Zod Schemas)', () => {
    describe('getIngredientsMacrosSchema', () => {
      it('accepts valid string and array of strings', () => {
        expect(getIngredientsMacrosSchema.safeParse({ ingredient_names: 'Olive Oil' }).success).toBe(true);
        expect(getIngredientsMacrosSchema.safeParse({ ingredient_names: ['Egg', 'Spinach'] }).success).toBe(true);
      });

      it('rejects empty arrays or arrays of whitespace', () => {
        expect(getIngredientsMacrosSchema.safeParse({ ingredient_names: [] }).success).toBe(false);
        expect(getIngredientsMacrosSchema.safeParse({ ingredient_names: ['   ', ''] }).success).toBe(false);
      });

      it('rejects missing or empty ingredient string', () => {
        expect(getIngredientsMacrosSchema.safeParse({}).success).toBe(false);
        expect(getIngredientsMacrosSchema.safeParse({ ingredient_names: '' }).success).toBe(false);
      });
    });

    describe('logFoodConsumptionSchema', () => {
      it('accepts valid food logging arguments with numeric values or strings', () => {
        expect(logFoodConsumptionSchema.safeParse({ food_name: 'Apple', calories: 95 }).success).toBe(true);
        expect(logFoodConsumptionSchema.safeParse({ food_name: 'Apple', calories: '95', protein: '0.5' }).success).toBe(true);
        expect(logFoodConsumptionSchema.safeParse({ food_name: 'Diet Soda', calories: 0 }).success).toBe(true);
      });

      it('rejects missing food_name or empty food_name', () => {
        expect(logFoodConsumptionSchema.safeParse({ calories: 100 }).success).toBe(false);
        expect(logFoodConsumptionSchema.safeParse({ food_name: '   ', calories: 100 }).success).toBe(false);
      });

      it('rejects NaN, Infinity, negative values, and non-numeric strings', () => {
        expect(logFoodConsumptionSchema.safeParse({ food_name: 'Apple', calories: NaN }).success).toBe(false);
        expect(logFoodConsumptionSchema.safeParse({ food_name: 'Apple', calories: Infinity }).success).toBe(false);
        expect(logFoodConsumptionSchema.safeParse({ food_name: 'Apple', calories: -50 }).success).toBe(false);
        expect(logFoodConsumptionSchema.safeParse({ food_name: 'Apple', calories: 'not-a-number' }).success).toBe(false);
      });
    });

    describe('logExerciseSchema', () => {
      it('accepts valid positive duration and non-negative calories burned', () => {
        expect(logExerciseSchema.safeParse({ exercise_name: 'Running', duration_minutes: 30, calories_burned: 300 }).success).toBe(true);
        expect(logExerciseSchema.safeParse({ exercise_name: 'Stretching', duration_minutes: '15', calories_burned: 0 }).success).toBe(true);
      });

      it('rejects duration_minutes <= 0, NaN, Infinity, or non-numeric strings', () => {
        expect(logExerciseSchema.safeParse({ exercise_name: 'Rowing', duration_minutes: 0, calories_burned: 100 }).success).toBe(false);
        expect(logExerciseSchema.safeParse({ exercise_name: 'Rowing', duration_minutes: -10, calories_burned: 100 }).success).toBe(false);
        expect(logExerciseSchema.safeParse({ exercise_name: 'Rowing', duration_minutes: NaN, calories_burned: 100 }).success).toBe(false);
        expect(logExerciseSchema.safeParse({ exercise_name: 'Rowing', duration_minutes: Infinity, calories_burned: 100 }).success).toBe(false);
        expect(logExerciseSchema.safeParse({ exercise_name: 'Rowing', duration_minutes: 'abc', calories_burned: 100 }).success).toBe(false);
      });

      it('rejects negative calories_burned', () => {
        expect(logExerciseSchema.safeParse({ exercise_name: 'Rowing', duration_minutes: 10, calories_burned: -10 }).success).toBe(false);
      });
    });

    describe('logHydrationSchema', () => {
      it('accepts positive amount_ml', () => {
        expect(logHydrationSchema.safeParse({ amount_ml: 500 }).success).toBe(true);
        expect(logHydrationSchema.safeParse({ amount_ml: '250' }).success).toBe(true);
      });

      it('rejects amount_ml <= 0, NaN, Infinity, and non-numeric strings', () => {
        expect(logHydrationSchema.safeParse({ amount_ml: 0 }).success).toBe(false);
        expect(logHydrationSchema.safeParse({ amount_ml: -100 }).success).toBe(false);
        expect(logHydrationSchema.safeParse({ amount_ml: NaN }).success).toBe(false);
        expect(logHydrationSchema.safeParse({ amount_ml: Infinity }).success).toBe(false);
        expect(logHydrationSchema.safeParse({ amount_ml: 'invalid' }).success).toBe(false);
      });
    });

    describe('logWeightSchema', () => {
      it('accepts positive weight_kg', () => {
        expect(logWeightSchema.safeParse({ weight_kg: 72.5 }).success).toBe(true);
        expect(logWeightSchema.safeParse({ weight_kg: '80' }).success).toBe(true);
      });

      it('rejects weight_kg <= 0, NaN, Infinity, and non-numeric strings', () => {
        expect(logWeightSchema.safeParse({ weight_kg: 0 }).success).toBe(false);
        expect(logWeightSchema.safeParse({ weight_kg: -70 }).success).toBe(false);
        expect(logWeightSchema.safeParse({ weight_kg: NaN }).success).toBe(false);
        expect(logWeightSchema.safeParse({ weight_kg: Infinity }).success).toBe(false);
        expect(logWeightSchema.safeParse({ weight_kg: 'heavy' }).success).toBe(false);
      });
    });

    it('suppresses UI token emissions when tool validation fails', async () => {
      const emittedTokens: string[] = [];
      const invalidCalls: FunctionCall[] = [
        { name: 'log_food_consumption', args: { food_name: '', calories: -10 } },
        { name: 'log_exercise', args: { exercise_name: 'Run', duration_minutes: 0, calories_burned: 100 } },
        { name: 'log_hydration', args: { amount_ml: -250 } },
        { name: 'log_weight', args: { weight_kg: 'invalid-weight' } },
        { name: 'get_ingredients_macros', args: { ingredient_names: [] } },
      ];

      const results = await executeSageToolCalls(invalidCalls, {
        emitToolToken: (tok) => emittedTokens.push(tok),
      });

      expect(results).toHaveLength(5);
      expect((results[0].functionResponse?.response as any).error).toContain('food_name');
      expect((results[1].functionResponse?.response as any).error).toContain('duration_minutes');
      expect((results[2].functionResponse?.response as any).error).toContain('amount_ml');
      expect((results[3].functionResponse?.response as any).error).toContain('weight_kg');
      expect((results[4].functionResponse?.response as any).error).toContain('ingredient name');

      expect(emittedTokens).toHaveLength(0);
    });
  });

  describe('ThoughtDemarcator (Production Class)', () => {
    it('formats multiple thought chunks into a single contiguous <thought> block', () => {
      const chunks: string[] = [];
      const demarcator = new ThoughtDemarcator((c) => chunks.push(c));

      demarcator.pushThought('I should analyze ');
      demarcator.pushThought('the macro balance ');
      demarcator.pushThought('carefully.');
      demarcator.pushContent('Here is the recipe: Roast Duck.');
      demarcator.flush();

      const combined = chunks.join('');
      expect(combined).toBe(
        '<thought>\nI should analyze the macro balance carefully.\n</thought>\nHere is the recipe: Roast Duck.'
      );
      expect(combined.match(/<thought>/g)).toHaveLength(1);
      expect(combined.match(/<\/thought>/g)).toHaveLength(1);
    });

    it('closes thought block prior to emitting UI tool tokens', () => {
      const chunks: string[] = [];
      const demarcator = new ThoughtDemarcator((c) => chunks.push(c));

      demarcator.pushThought('Deciding to log hydration.');
      demarcator.pushToolToken('\n\n___TOOL_CALL_LOG_HYDRATION___{"amount_ml":500}\n\n');
      demarcator.pushContent('Water intake logged successfully.');
      demarcator.flush();

      const combined = chunks.join('');
      expect(combined).toBe(
        '<thought>\nDeciding to log hydration.\n</thought>\n\n\n___TOOL_CALL_LOG_HYDRATION___{"amount_ml":500}\n\nWater intake logged successfully.'
      );
    });

    it('flushes open thought block at stream completion if no content followed', () => {
      const chunks: string[] = [];
      const demarcator = new ThoughtDemarcator((c) => chunks.push(c));

      demarcator.pushThought('Final internal deliberation.');
      demarcator.flush();

      const combined = chunks.join('');
      expect(combined).toBe('<thought>\nFinal internal deliberation.\n</thought>\n');
    });
  });

  describe('AsyncQueue', () => {
    it('dispatches items in real-time when awaiting consumer is active', async () => {
      const queue = new AsyncQueue<string>();
      const results: string[] = [];

      const consumerPromise = (async () => {
        for await (const item of queue) {
          results.push(item);
        }
      })();

      await new Promise((r) => setTimeout(r, 10));
      queue.push('item 1');
      await new Promise((r) => setTimeout(r, 10));
      expect(results).toEqual(['item 1']);

      queue.push('item 2');
      await new Promise((r) => setTimeout(r, 10));
      expect(results).toEqual(['item 1', 'item 2']);

      queue.end();
      await consumerPromise;
      expect(results).toEqual(['item 1', 'item 2']);
    });

    it('guarantees stream-end flush of all buffered items before completion', async () => {
      const queue = new AsyncQueue<string>();
      queue.push('buffered 1');
      queue.push('buffered 2');
      queue.push('buffered 3');
      queue.end();

      const collected: string[] = [];
      for await (const val of queue) {
        collected.push(val);
      }
      expect(collected).toEqual(['buffered 1', 'buffered 2', 'buffered 3']);
    });

    it('propagates errors to awaiting and subsequent readers', async () => {
      const queue = new AsyncQueue<string>();
      queue.push('valid item');
      queue.error(new Error('Stream failure'));

      const iterator = queue[Symbol.asyncIterator]();
      const first = await iterator.next();
      expect(first.value).toBe('valid item');

      await expect(iterator.next()).rejects.toThrow('Stream failure');
    });

    it('terminates cleanly on return()', async () => {
      const queue = new AsyncQueue<string>();
      const iterator = queue[Symbol.asyncIterator]();
      queue.push('item');
      await iterator.return?.();
      const res = await iterator.next();
      expect(res.done).toBe(true);
    });
  });

  describe('streamSage Production Integration', () => {
    it('throws error when GEMINI_API_KEY is not configured', async () => {
      const origKey = process.env.GEMINI_API_KEY;
      delete process.env.GEMINI_API_KEY;

      try {
        const stream = streamSage('Hello');
        await expect(stream.next()).rejects.toThrow('GEMINI_API_KEY is not configured.');
      } finally {
        process.env.GEMINI_API_KEY = origKey;
      }
    });

    it('yields UI marker token BEFORE trailing model response text in stream', async () => {
      // Turn 1: Model issues a function call
      async function* turn1() {
        yield {
          candidates: [
            {
              content: {
                parts: [
                  {
                    functionCall: {
                      name: 'log_hydration',
                      args: { amount_ml: 500 },
                      id: 'call_hydro_1',
                    },
                  },
                ],
              },
            },
          ],
        };
      }

      // Turn 2: Follow-up response after tool execution
      async function* turn2() {
        yield {
          candidates: [
            {
              content: {
                parts: [{ text: 'I have logged 500ml of water intake.' }],
              },
            },
          ],
        };
      }

      mockSendMessageStream
        .mockResolvedValueOnce(turn1())
        .mockResolvedValueOnce(turn2());

      const stream = streamSage('I drank 500ml water');
      const receivedChunks: string[] = [];

      for await (const chunk of stream) {
        receivedChunks.push(chunk);
      }

      const fullOutput = receivedChunks.join('');
      expect(fullOutput).toContain('___TOOL_CALL_LOG_HYDRATION___');
      expect(fullOutput).toContain('I have logged 500ml of water intake.');

      const markerIndex = fullOutput.indexOf('___TOOL_CALL_LOG_HYDRATION___');
      const textIndex = fullOutput.indexOf('I have logged 500ml of water intake.');
      expect(markerIndex).toBeLessThan(textIndex);
    });

    it('delivers buffered UI marker even when no trailing model text exists', async () => {
      // Turn 1: Model issues a function call
      async function* turn1() {
        yield {
          candidates: [
            {
              content: {
                parts: [
                  {
                    functionCall: {
                      name: 'log_weight',
                      args: { weight_kg: 80 },
                      id: 'call_weight_1',
                    },
                  },
                ],
              },
            },
          ],
        };
      }

      // Turn 2: Follow-up produces no content parts (empty turn)
      async function* turn2() {
        yield {
          candidates: [],
        };
      }

      mockSendMessageStream
        .mockResolvedValueOnce(turn1())
        .mockResolvedValueOnce(turn2());

      const stream = streamSage('My weight is 80kg');
      const receivedChunks: string[] = [];

      for await (const chunk of stream) {
        receivedChunks.push(chunk);
      }

      const fullOutput = receivedChunks.join('');
      expect(fullOutput).toContain('___TOOL_CALL_LOG_WEIGHT___');
      expect(fullOutput).toContain('80');
    });

    it('calibrates thinking config dynamically to MINIMAL when logging intent is detected', async () => {
      async function* turn() {
        yield { candidates: [{ content: { parts: [{ text: 'Logged food' }] } }] };
      }
      mockSendMessageStream.mockResolvedValueOnce(turn());

      const stream = streamSage('I ate 200g grilled salmon');
      for await (const chunk of stream) {
        expect(chunk).toBeDefined();
      }

      expect(mockCreateChat).toHaveBeenCalled();
      const lastCall = mockCreateChat.mock.calls[mockCreateChat.mock.calls.length - 1][0];
      expect(lastCall.config.thinkingConfig.thinkingLevel).toBe(ThinkingLevel.MINIMAL);
      expect(lastCall.config.thinkingConfig.includeThoughts).toBe(true);
    });

    it('calibrates thinking config to HIGH when culinary or general intent is present', async () => {
      async function* turn() {
        yield { candidates: [{ content: { parts: [{ text: 'Here is your recipe' }] } }] };
      }
      mockSendMessageStream.mockResolvedValueOnce(turn());

      const stream = streamSage('Design an elegant 3-course French dinner', undefined, undefined, undefined, 'metric', undefined, null, 'culinary');
      for await (const chunk of stream) {
        expect(chunk).toBeDefined();
      }

      expect(mockCreateChat).toHaveBeenCalled();
      const lastCall = mockCreateChat.mock.calls[mockCreateChat.mock.calls.length - 1][0];
      expect(lastCall.config.thinkingConfig.thinkingLevel).toBe(ThinkingLevel.HIGH);
      expect(lastCall.config.thinkingConfig.includeThoughts).toBe(true);
    });
  });

  describe('Dynamic Intent Detection (resolveSageIntent & LOGGING_INTENT_REGEX)', () => {
    it('matches heuristic phrasing patterns using LOGGING_INTENT_REGEX', () => {
      expect(LOGGING_INTENT_REGEX.test('log lunch: 200g grilled salmon')).toBe(true);
      expect(LOGGING_INTENT_REGEX.test('i ate 2 poached eggs and toast')).toBe(true);
      expect(LOGGING_INTENT_REGEX.test('i drank 500ml water')).toBe(true);
      expect(LOGGING_INTENT_REGEX.test('i had a protein shake')).toBe(true);
      expect(LOGGING_INTENT_REGEX.test('track 5km morning run')).toBe(true);
      expect(LOGGING_INTENT_REGEX.test('weighed 78.5kg this morning')).toBe(true);
      expect(LOGGING_INTENT_REGEX.test('water intake 1500ml')).toBe(true);
      expect(LOGGING_INTENT_REGEX.test('drank 250ml orange juice')).toBe(true);
      expect(LOGGING_INTENT_REGEX.test('Can you suggest a high-protein dinner?')).toBe(false);
    });

    it('detects logging intent across heuristic phrasing patterns', () => {
      expect(resolveSageIntent('log lunch: 200g grilled salmon')).toBe('logging');
      expect(resolveSageIntent('i ate 2 poached eggs and toast')).toBe('logging');
      expect(resolveSageIntent('i drank 500ml water')).toBe('logging');
      expect(resolveSageIntent('i had a protein shake')).toBe('logging');
      expect(resolveSageIntent('track 5km morning run')).toBe('logging');
      expect(resolveSageIntent('weighed 78.5kg this morning')).toBe('logging');
      expect(resolveSageIntent('water intake 1500ml')).toBe('logging');
      expect(resolveSageIntent('drank 250ml orange juice')).toBe('logging');
    });

    it('defaults to general intent for recipe, technique, and wellness prompts', () => {
      expect(resolveSageIntent('Can you suggest a high-protein dinner?')).toBe('general');
      expect(resolveSageIntent('How do I prevent a béarnaise sauce from breaking?')).toBe('general');
      expect(resolveSageIntent('What is the optimal post-workout meal?')).toBe('general');
    });

    it('respects explicit intent override over prompt text', () => {
      expect(resolveSageIntent('log 200g salmon', 'culinary')).toBe('culinary');
      expect(resolveSageIntent('How to cook steak', 'logging')).toBe('logging');
      expect(resolveSageIntent('i ate an apple', 'general')).toBe('general');
    });
  });

  describe('Atwater Macro Fallback Calculation', () => {
    it('computes accurate energetic density via Atwater factors: 4*P + 4*C + 9*F', () => {
      // 20g protein, 10g carbs, 5g fat -> 20*4 + 10*4 + 5*9 = 80 + 40 + 45 = 165 kcal
      expect(calculateAtwaterCalories(20, 10, 5)).toBe(165);

      // Ribeye macros: 18.74g protein, 0g carbs, 20.04g fat -> 18.74*4 + 20.04*9 = 74.96 + 180.36 = 255.32 -> 255 kcal
      expect(calculateAtwaterCalories(18.74, 0, 20.04)).toBe(255);

      // Zero macros -> 0 kcal
      expect(calculateAtwaterCalories(0, 0, 0)).toBe(0);
    });

    it('applies Atwater fallback in fetchMacros when cached calories are missing or 0.00', async () => {
      const { globalMacroCache } = await import('@/lib/macroCache');
      vi.mocked(globalMacroCache.get).mockReturnValueOnce([
        {
          ingredient_matched: 'Raw Ribeye Steak',
          calories: '0.00',
          protein: '18.74',
          carbs: '0.00',
          fat: '20.04',
        },
      ]);

      const res = (await fetchMacros(['Raw Ribeye Steak'])) as Record<string, any>;
      const entry = res['Raw Ribeye Steak'];
      expect(entry).toBeDefined();
      expect(entry.status).toBe('Success (per 100g)');
      // Calorie anomaly 0.00 should be resolved by Atwater fallback to 255.0
      expect(entry.calories).toBe('255.0');
    });
  });

  describe('USDA Markdown Table Regression', () => {
    it('restores valid 9-column delimiter row matching 9 headers in src/lib/sage.ts', () => {
      const sagePath = path.resolve(process.cwd(), 'src/lib/sage.ts');
      const content = fs.readFileSync(sagePath, 'utf8');

      // Check header line has 9 column names
      const headerMatch = content.match(/\| \*\*Ingredient\*\* \| \*\*Calories\*\* \| \*\*Protein\*\* \| \*\*Carbs\*\* \| \*\*Fat\*\* \| \*\*Fiber\*\* \| \*\*Sugar\*\* \| \*\*Sodium\*\* \| \*\*Common Portions\*\* \|/);
      expect(headerMatch).not.toBeNull();

      // Check delimiter line has 9 delimiter cells: "| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |"
      const delimiterMatch = content.match(/\| :--- \| :--- \| :--- \| :--- \| :--- \| :--- \| :--- \| :--- \| :--- \|/);
      expect(delimiterMatch).not.toBeNull();

      if (delimiterMatch) {
        const delimiterCells = delimiterMatch[0].split('|').filter((c) => c.trim().length > 0);
        expect(delimiterCells).toHaveLength(9);
      }
    });
  });
});
