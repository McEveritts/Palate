import { GoogleGenerativeAI, FunctionDeclaration, SchemaType } from "@google/generative-ai";
import { scheduleMeal, getScheduledMeals, moveScheduledMeal, cancelScheduledMeal } from "../app/actions";

// Weekday indexes
const WEEKDAYS: { [key: string]: number } = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6
};

/**
 * Robust temporal resolver to resolve relative date queries to standard YYYY-MM-DD strings.
 */
export function resolveTemporalQuery(query: string, referenceDate: Date = new Date()): string {
  const normalized = query.toLowerCase().trim();
  
  const addDays = (d: Date, days: number): Date => {
    const result = new Date(d);
    result.setDate(result.getDate() + days);
    return result;
  };
  
  const formatDate = (d: Date): string => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  if (normalized === 'today' || normalized === 'tonight' || normalized === 'now') {
    return formatDate(referenceDate);
  }
  if (normalized === 'tomorrow') {
    return formatDate(addDays(referenceDate, 1));
  }
  if (normalized === 'yesterday') {
    return formatDate(addDays(referenceDate, -1));
  }
  if (normalized === 'day after tomorrow') {
    return formatDate(addDays(referenceDate, 2));
  }
  if (normalized === 'day before yesterday') {
    return formatDate(addDays(referenceDate, -2));
  }

  // Handle "in X days"
  const inDaysMatch = normalized.match(/in\s+(\d+)\s+days?/);
  if (inDaysMatch) {
    const days = parseInt(inDaysMatch[1], 10);
    return formatDate(addDays(referenceDate, days));
  }

  // Handle "X days from now"
  const daysFromNowMatch = normalized.match(/(\d+)\s+days?\s+from\s+now/);
  if (daysFromNowMatch) {
    const days = parseInt(daysFromNowMatch[1], 10);
    return formatDate(addDays(referenceDate, days));
  }

  // Handle "X days ago"
  const daysAgoMatch = normalized.match(/(\d+)\s+days?\s+ago/);
  if (daysAgoMatch) {
    const days = parseInt(daysAgoMatch[1], 10);
    return formatDate(addDays(referenceDate, -days));
  }

  // Handle weekday resolution (e.g. "next Friday", "this Monday", "Friday")
  for (const [name, targetDay] of Object.entries(WEEKDAYS)) {
    if (normalized.includes(name)) {
      const currentDay = referenceDate.getDay();
      let diff = targetDay - currentDay;
      
      if (normalized.includes('next')) {
        return formatDate(addDays(referenceDate, diff + 7));
      } else if (normalized.includes('this')) {
        if (diff < 0) diff += 7;
        return formatDate(addDays(referenceDate, diff));
      } else {
        if (diff <= 0) diff += 7;
        return formatDate(addDays(referenceDate, diff));
      }
    }
  }

  // Validate if already YYYY-MM-DD
  const isoMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return normalized;
  }

  // Fallback to ISO format of the reference date
  return formatDate(referenceDate);
}

/**
 * Extracts meal type ('Breakfast' | 'Lunch' | 'Dinner' | 'Snack') and resolves relative dates from query.
 */
export function resolveMealTypeAndDate(query: string, referenceDate: Date = new Date()): { dateStr: string; mealType?: string } {
  const normalized = query.toLowerCase().trim();
  
  let mealType: string | undefined;
  if (normalized.includes('breakfast')) {
    mealType = 'Breakfast';
  } else if (normalized.includes('lunch')) {
    mealType = 'Lunch';
  } else if (normalized.includes('dinner') || normalized.includes('supper')) {
    mealType = 'Dinner';
  } else if (normalized.includes('snack')) {
    mealType = 'Snack';
  }

  const cleanDateQuery = normalized
    .replace(/(breakfast|lunch|dinner|supper|snack)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  const dateStr = resolveTemporalQuery(cleanDateQuery, referenceDate);
  return { dateStr, mealType };
}

// Function Declarations for Gemini/Gemma-4 function calling structure
export const calendarToolsDeclarations: FunctionDeclaration[] = [
  {
    name: "schedule_meal",
    description: "Schedules a meal with a specific recipe, date, meal type, and optional planned yield and parent meal ID.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        recipeId: {
          type: SchemaType.STRING,
          description: "The unique ID or slug of the recipe to schedule."
        },
        dateStr: {
          type: SchemaType.STRING,
          description: "The date to schedule (e.g. 'YYYY-MM-DD' or relative statements like 'tomorrow')."
        },
        mealType: {
          type: SchemaType.STRING,
          description: "The meal type. Must be 'Breakfast', 'Lunch', 'Dinner', or 'Snack'."
        },
        plannedYield: {
          type: SchemaType.NUMBER,
          description: "Portions or yield planned (optional, defaults to 1.0)."
        },
        parentMealId: {
          type: SchemaType.STRING,
          description: "Parent meal ID for leftovers tracking (optional)."
        }
      },
      required: ["recipeId", "dateStr", "mealType"]
    }
  },
  {
    name: "get_scheduled_meals",
    description: "Retrieves scheduled meals within a specific date range.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        startDateStr: {
          type: SchemaType.STRING,
          description: "Start date of the range (e.g. 'YYYY-MM-DD' or relative like 'today')."
        },
        endDateStr: {
          type: SchemaType.STRING,
          description: "End date of the range (e.g. 'YYYY-MM-DD' or relative like 'next Friday')."
        }
      },
      required: ["startDateStr", "endDateStr"]
    }
  },
  {
    name: "move_scheduled_meal",
    description: "Moves an already scheduled meal to a new date and/or changes its meal type.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        mealId: {
          type: SchemaType.STRING,
          description: "The unique ID of the scheduled meal to update."
        },
        newDateStr: {
          type: SchemaType.STRING,
          description: "The new date (e.g. 'YYYY-MM-DD' or relative statements)."
        },
        newMealType: {
          type: SchemaType.STRING,
          description: "The new meal type (e.g. 'Breakfast', 'Lunch', 'Dinner', 'Snack')."
        }
      },
      required: ["mealId", "newDateStr", "newMealType"]
    }
  },
  {
    name: "cancel_scheduled_meal",
    description: "Cancels/deletes a scheduled meal using its unique ID.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        mealId: {
          type: SchemaType.STRING,
          description: "The unique ID of the scheduled meal to cancel."
        }
      },
      required: ["mealId"]
    }
  }
];

export function getCalendarSystemInstructions(baseDate: Date, timeZoneOffset: string): string {
  const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dateString = baseDate.toISOString().split('T')[0];
  const dayName = weekdays[baseDate.getDay()];
  
  return `[SYSTEM INSTRUCTION]
You are Sage (🌿), the digital sous-chef and calendar agent for Palate.
You help users schedule, retrieve, move, and cancel meals.

[CORE CONTEXT]
- Today's date is: ${dateString} (${dayName})
- User's timezone offset: ${timeZoneOffset}

[TEMPORAL RESOLVING RULES]
If the user specifies a relative date:
- "today" or "tonight" refers to: ${dateString}
- "tomorrow" refers to: the day after ${dateString}
- "yesterday" refers to: the day before ${dateString}
- "next [weekday]" refers to the weekday of the following week.
- "this [weekday]" refers to the closest upcoming weekday.

[MEAL TYPE DEFAULTS]
If the user does not specify a meal type, default based on the hour of today:
- Morning (before 10 AM): 'Breakfast'
- Midday (10 AM to 3 PM): 'Lunch'
- Evening (after 3 PM): 'Dinner'
- Late Night / Snack: 'Snack'

[TOOL CALLING INTEGRATION]
You have access to tools:
- schedule_meal(recipeId, dateStr, mealType, plannedYield, parentMealId)
- get_scheduled_meals(startDateStr, endDateStr)
- move_scheduled_meal(mealId, newDateStr, newMealType)
- cancel_scheduled_meal(mealId)

Always execute tool calls using absolute date formats (YYYY-MM-DD). If you need to make a relative date absolute, do so inside your thought process first.
You MUST begin every single response with a <thought> tag. Within <thought> ... </thought> tags, perform all calculations, resolve relative dates to absolute dates, select the correct tool, and format your thoughts with elegant precision.
Only output the tool call or the final response after the </thought> tag.
`;
}

interface CalendarAgentResponse {
  thought: string;
  response: string;
  toolCallExecuted?: {
    name: string;
    args: any;
    result: any;
  };
}

/**
 * Runs the Calendar Agent using Gemma-4 or Gemini 3.1 tool execution.
 * Handles the single-turn function calling intercept loop.
 */
export async function runCalendarAgent(
  prompt: string,
  options: {
    baseDate?: Date;
    timeZoneOffset?: string;
    clientApiKey?: string;
    modelName?: string;
  } = {}
): Promise<CalendarAgentResponse> {
  const finalApiKey = options.clientApiKey || process.env.GEMINI_API_KEY || "";
  if (!finalApiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const baseDate = options.baseDate || new Date();
  const timeZoneOffset = options.timeZoneOffset || "-04:00";
  const modelName = options.modelName || "gemma-4-31b-it";

  const systemInstruction = getCalendarSystemInstructions(baseDate, timeZoneOffset);
  const genAI = new GoogleGenerativeAI(finalApiKey);
  
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction,
    generationConfig: { temperature: 0.1 },
    tools: [{ functionDeclarations: calendarToolsDeclarations }]
  });

  const chat = model.startChat();
  
  // Step 1: Send the user prompt to the model
  const result = await chat.sendMessage(prompt);
  const textContent = result.response.text();
  
  // Extract preserved thoughts from the output
  const thoughtMatch = textContent.match(/<thought>([\s\S]*?)<\/thought>/);
  const thought = thoughtMatch ? thoughtMatch[1].trim() : "";
  
  const functionCalls = result.response.functionCalls();
  
  if (functionCalls && functionCalls.length > 0) {
    const call = functionCalls[0];
    const name = call.name;
    const args = call.args as any;
    
    let actionResult: any;
    let resolvedArgs = { ...args };

    try {
      if (name === "schedule_meal") {
        // Intercept relative date/mealType
        const { dateStr, mealType } = resolveMealTypeAndDate(args.dateStr || "today", baseDate);
        resolvedArgs.dateStr = dateStr;
        resolvedArgs.mealType = args.mealType || mealType || "Dinner";
        
        actionResult = await scheduleMeal(
          resolvedArgs.recipeId,
          resolvedArgs.dateStr,
          resolvedArgs.mealType,
          resolvedArgs.plannedYield ?? 1.0,
          resolvedArgs.parentMealId
        );
      } else if (name === "get_scheduled_meals") {
        resolvedArgs.startDateStr = resolveTemporalQuery(args.startDateStr || "today", baseDate);
        resolvedArgs.endDateStr = resolveTemporalQuery(args.endDateStr || "today", baseDate);
        
        actionResult = await getScheduledMeals(
          resolvedArgs.startDateStr,
          resolvedArgs.endDateStr
        );
      } else if (name === "move_scheduled_meal") {
        const { dateStr, mealType } = resolveMealTypeAndDate(args.newDateStr || "today", baseDate);
        resolvedArgs.newDateStr = dateStr;
        resolvedArgs.newMealType = args.newMealType || mealType || "Dinner";

        actionResult = await moveScheduledMeal(
          resolvedArgs.mealId,
          resolvedArgs.newDateStr,
          resolvedArgs.newMealType
        );
      } else if (name === "cancel_scheduled_meal") {
        actionResult = await cancelScheduledMeal(resolvedArgs.mealId);
      } else {
        throw new Error(`Unknown calendar tool: ${name}`);
      }

      // Step 2: Feed function execution response back to model to get final natural language explanation
      const followUp = await chat.sendMessage([{
        functionResponse: {
          name,
          response: actionResult
        }
      }]);

      const followUpText = followUp.response.text();
      // Clean up the text representation if needed
      const cleanResponse = followUpText.replace(/<thought>[\s\S]*?<\/thought>/g, '').trim();

      return {
        thought,
        response: cleanResponse || `Successfully executed ${name}.`,
        toolCallExecuted: {
          name,
          args: resolvedArgs,
          result: actionResult
        }
      };

    } catch (err: any) {
      console.error(`Error in runCalendarAgent execution of ${name}:`, err);
      return {
        thought,
        response: `🌿 I encountered an issue updating your culinary calendar: ${err.message}`,
        toolCallExecuted: {
          name,
          args: resolvedArgs,
          result: { success: false, error: err.message }
        }
      };
    }
  }

  // If no function call was returned, just return the text response directly
  const response = textContent.replace(/<thought>[\s\S]*?<\/thought>/g, '').trim();
  return {
    thought,
    response
  };
}
