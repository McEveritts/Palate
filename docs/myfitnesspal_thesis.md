# A Local-First, AI-Enriched Paradigm for Individualized Anthropometric and Bioenergetics Tracking
## *Integrating Clinical Nutrition Analytics with the Sage AI Sous-Chef*

**Author:** Antigravity AI  
**Subject:** Advanced Systems Engineering & Clinical Dietetics  
**Project:** Palate (Your AI Sous-Chef)

---

## Abstract

This thesis presents the theoretical, mathematical, and architectural foundations for integrating a clinical-grade personal nutrition and energy expenditure tracking engine—modeled on MyFitnessPal—directly into the local-first, privacy-preserving **Palate** application. By fusing deterministic bioenergetic algorithms with the non-deterministic reasoning capabilities of the Google Gemini-powered **Sage** AI agent, we introduce a hybrid health-coaching paradigm. 

We explore the bioenergetic equations of human metabolism (Mifflin-St Jeor, TDEE scaling, and macronutrient dynamics), define a local-first synchronization schema utilizing Zustand and Prisma/PostgreSQL, specify cognitive tool-calling integrations, and present full implementation architectures for client-side execution. The result is a highly secure, zero-latency culinary intelligence system that scales seamlessly from a standalone offline sandbox to a globally synchronized household database.

---

## Chapter 1: The Bioenergetics of Anthropometry & Human Metabolism

To establish a highly precise, individual-based nutrition diary, the application must translate a user's biological metrics into precise metabolic targets. This chapter mathematically derives the models utilized by the system to compute caloric budgets, active expenditure, and macronutrient partitions.

### 1.1 Basal Metabolic Rate (BMR)
Basal Metabolic Rate represents the minimal rate of energy expenditure per unit of time by endothermic animals at rest. In clinical dietetics, two main mathematical models are deployed: the Harris-Benedict equation (Revised) and the Mifflin-St Jeor equation. Clinical studies demonstrate that the Mifflin-St Jeor equation provides a more reliable estimate of true resting energy expenditure in modern populations (within $\pm10\%$ of measured BMR).

#### 1.1.1 The Mifflin-St Jeor Formulations
Let $W$ be body weight in kilograms, $H$ be stature in centimeters, and $A$ be age in years. The BMR (expressed in kilocalories per 24 hours) is defined as:

$$\text{BMR}_{\text{male}}(W, H, A) = 10W + 6.25H - 5A + 5$$

$$\text{BMR}_{\text{female}}(W, H, A) = 10W + 6.25H - 5A - 161$$

#### 1.1.2 The Revised Harris-Benedict Formulations
As a secondary clinical reference, the revised Harris-Benedict equations are defined as:

$$\text{BMR}_{\text{male}}(W, H, A) = 88.362 + 13.397W + 4.799H - 5.677A$$

$$\text{BMR}_{\text{female}}(W, H, A) = 447.593 + 9.247W + 3.098H - 4.330A$$

---

### 1.2 Total Daily Energy Expenditure (TDEE) & Physical Activity Level (PAL)
Resting metabolism represents only a fraction of total daily energy requirement. To account for the thermic effect of food (TEF) and the energy cost of physical activity, BMR must be scaled by a Physical Activity Level ($\text{PAL}$) coefficient:

$$\text{TDEE} = \text{BMR} \times \text{PAL}$$

The active coefficient ($\text{PAL}$) is discrete and classified according to standard lifestyle habits:

```
                  Resting Metabolism (BMR)
                             │
                             ▼
              [Physical Activity Level (PAL)]
                             │
       ┌───────────┬─────────┼───────────┬───────────┐
       ▼           ▼         ▼           ▼           ▼
   Sedentary    Light     Moderate     Active    Hyperactive
    (1.200)    (1.375)    (1.550)     (1.725)      (1.900)
```

*   **Sedentary ($\text{PAL} = 1.200$):** Minimal movement, desk job, no structured exercise.
*   **Lightly Active ($\text{PAL} = 1.375$):** Light active walking, light sports 1-3 days per week.
*   **Moderately Active ($\text{PAL} = 1.550$):** Continuous physical movement, training 3-5 days per week.
*   **Very Active ($\text{PAL} = 1.725$):** Strenuous training or physical labor 6-7 days per week.
*   **Hyper Active ($\text{PAL} = 1.900$):** Double training sessions, elite athletic coaching, or high-intensity occupational labor.

---

### 1.3 Caloric Goal Adaptation
Daily Caloric Target ($E_{\text{target}}$) is modulated by the user's primary thermodynamic objective:

$$E_{\text{target}} = \text{TDEE} + \Delta E_{\text{objective}}$$

The energy delta ($\Delta E_{\text{objective}}$) represents the caloric surplus or deficit required to stimulate cellular hypertrophy or adipose tissue catabolism:
1.  **Adipose Catabolism (Fat Loss):** To stimulate the beta-oxidation of stored triglycerides, a typical deficit of $-500\text{ kcal/day}$ is applied, corresponding theoretically to a loss of approximately $0.45\text{ kg}$ ($1\text{ lb}$) of adipose tissue per week:
    $$\Delta E_{\text{objective}} = -500\text{ kcal/day}$$
    *Note: The metabolic floor is strictly locked at $1200\text{ kcal/day}$ for biological females and $1500\text{ kcal/day}$ for biological males to prevent hormonal dysregulation, metabolic adaptation, and micronutrient starvation.*
2.  **Energy Balance (Weight Maintenance):**
    $$\Delta E_{\text{objective}} = 0\text{ kcal/day}$$
3.  **Muscle Hypertrophy (Weight Gain):** To support protein synthesis and fuel resistance training recovery, a controlled surplus of $+250\text{ to } +500\text{ kcal/day}$ is established:
    $$\Delta E_{\text{objective}} = +250 \text{ to } +500\text{ kcal/day}$$

---

### 1.4 Macronutrient Distribution Models
The total caloric target $E_{\text{target}}$ is divided into three primary macronutrients, each exhibiting distinct thermodynamic energy densities:
*   **Protein ($P$):** $4\text{ kcal/g}$
*   **Carbohydrates ($C$):** $4\text{ kcal/g}$
*   **Fats ($F$):** $9\text{ kcal/g}$

The allocation of macronutrients is computed by establishing percentage weights ($\theta_P, \theta_C, \theta_F$) such that:

$$\theta_P + \theta_C + \theta_F = 1.0 \quad (100\%)$$

Gram allocations are then determined via:

$$P_{\text{grams}} = \frac{E_{\text{target}} \times \theta_P}{4}, \quad C_{\text{grams}} = \frac{E_{\text{target}} \times \theta_C}{4}, \quad F_{\text{grams}} = \frac{E_{\text{target}} \times \theta_F}{9}$$

#### Standard Nutritional Splitting Configurations:

| Diet Profile | Protein ($\theta_P$) | Carbohydrates ($\theta_C$) | Fats ($\theta_F$) | Clinical Rationale |
| :--- | :--- | :--- | :--- | :--- |
| **Balanced** | $30\%$ | $40\%$ | $30\%$ | USDA standard for endurance, muscle recovery, and energy consistency. |
| **High-Protein**| $40\%$ | $30\%$ | $30\%$ | Maximizes the Thermic Effect of Food (TEF) and peptide YY (satiety signaling). |
| **Ketogenic** | $25\%$ | $5\%$ | $70\%$ | Induces hepatic ketogenesis; shifts primary cellular fuel from glucose to ketone bodies. |
| **Custom** | User Defined| User Defined | User Defined | Allows high-performance athletes to adapt macro-splits to training cycles. |

---

### 1.5 Exercise Bioenergetics & MET Calculations
To prevent metabolic imbalance, physical activity calories are calculated using the Metabolic Equivalent of Task (MET) standard. A MET is defined as the ratio of work metabolic rate to a standard resting metabolic rate:

$$1\text{ MET} \equiv 1\text{ kcal/kg/hour} \equiv 3.5\text{ ml } O_2\text{/kg/minute}$$

The rate of energetic expenditure ($E_{\text{active}}$) in kilocalories during a specific training duration ($T$ in minutes) for a body mass ($W$ in kilograms) is computed as:

$$E_{\text{active}} = \text{MET} \times 3.5 \times \left(\frac{W}{200}\right) \times T$$

#### Standardized MET Table:

| Exercise Type | Intensity Level | MET Score |
| :--- | :--- | :--- |
| **Resistance Training**| Free weights, hypertrophy, heavy compound sets | $6.0$ |
| **Resistance Training**| Light weights, machine/isolation training | $3.5$ |
| **Cardio Running** | Moderate pace ($8.0\text{ km/h}$ or $5\text{ mph}$) | $8.0$ |
| **Cardio Bicycling** | Moderate effort ($19-22\text{ km/h}$) | $8.0$ |
| **Cardio Swimming** | Slow/moderate crawl laps | $5.8$ |
| **Cardio Walking** | Brisk pace ($5.6\text{ km/h}$ or $3.5\text{ mph}$) | $3.3$ |

---

## Chapter 2: Local-First Engineering & Hybrid State Machines

Palate is engineered as a **local-first** application. This architecture ensures complete privacy, instant load speeds, and offline functionality, while supporting multi-device synchronization when a network connection is available.

### 2.1 The Hybrid Sync Lifecycle
Palate Diary utilizes a multi-layered storage lifecycle:
1.  **Zustand Ephemeral State:** Keeps current diary records in active memory for instant UI rendering.
2.  **Browser Sandbox Caching (`sessionStorage`/`IndexedDB`):** Restricts data leaks. Calorie entries, personal weights, and meal records are written locally using client-side cryptographic hashes where necessary.
3.  **PostgreSQL Cloud Sync:** Serves as the backup layer for signed-in users. When online, local writes trigger a lazy, non-blocking background queue that serializes entries to PostgreSQL via Next.js Server Actions.

```
       [ Client User Action ]
                 │
                 ▼
     ┌───────────────────────┐
     │ Zustand Store (RAM)   │ ──► [ Instant UI Refresh ]
     └───────────────────────┘
                 │
                 ├────────────────────────┐
                 ▼                        ▼
     ┌───────────────────────┐  ┌───────────────────────┐
     │ sessionStorage/       │  │ Outbox Queue (Offline)│
     │ IndexedDB (Persistent)│  └───────────────────────┘
     └───────────────────────┘            │
                                          │ (Connection Restored)
                                          ▼
                                ┌───────────────────┐
                                │ PostgreSQL Cloud  │
                                └───────────────────┘
```

### 2.2 Relational Schema Modeling
To maintain a high-performance relational mapping, the Prisma PostgreSQL layer represents the personal tracking elements under five specialized models linked directly to the parent `User` and `Household` records. 

*   **`UserProfile`**: Stores basic anthropometric data (age, sex, height, weight), target goals, and calculated metabolic thresholds.
*   **`WeightLog`**: Captures historical body mass points, enabling historical tracking charts.
*   **`DailyLog`**: Represents a single day (YYYY-MM-DD), aggregating food logs, hydration metrics, and active exercise items.
*   **`FoodLogEntry`**: Stores discrete food items consumed, detailing the specific calories, protein, carbs, fat, and optional vault recipe links.
*   **`ExerciseLogEntry`**: Details aerobic (cardio) or anaerobic (strength) workouts.

---

## Chapter 3: Cognitive Integration with Generative AI (Sage)

Sage, Palate's digital sous-chef, acts as a primary interface for the user's diary. Fusing Sage's cognitive capabilities with deterministic logs requires two technical mechanics: **Systemic Context Injection** and **Structured Tool Calling**.

### 3.1 Context Injection Architecture
Every prompt sent to Sage is compiled within an enriched system context wrapper. The backend queries the current day's logs and injects the following structural markdown directly into the system instructions:

```markdown
[DYNAMIC CONTEXT - ACTIVE USER STATE]
User Profile: Male, 32 years old, 182cm, 82kg (Goal: FatLoss)
Metabolic Goals: 2,150 kcal | Protein: 160g | Carbs: 210g | Fat: 70g
Today's Log (2026-05-24):
  - Consumed: 1,240 kcal | Protein: 110g | Carbs: 130g | Fat: 32g
  - Burned: 350 kcal (Weight Training compound squats)
  - Net Calories: 890 kcal (Remaining: 1,260 kcal)
  - Hydration: 1,500ml / 2,500ml
  - Logged Items:
    * Breakfast: 3 Large Scrambled Eggs, 2 Slices Whole Wheat Toast
    * Lunch: Grilled Chicken Breast (150g), Quinoa (100g)
```

By providing Sage with precise nutritional balances, she can answer complex queries with high contextual accuracy (e.g., *"Sage, I have 50g of protein and 300 kcal left. What recipe in my vault should I cook for dinner?"*).

---

### 3.2 Zod-Constrained Tool Calling
To enable Sage to write directly to the user's diary, we define functional declarations with strict Zod constraints. If a user says: *"Sage, log a cup of black coffee and a banana for breakfast,"* the model parses the instruction and invokes `log_food_to_diary`.

```typescript
import { z } from 'zod';

export const LogFoodSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format must be YYYY-MM-DD"),
  mealType: z.enum(["Breakfast", "Lunch", "Dinner", "Snack"]),
  foodName: z.string().min(1),
  calories: z.number().int().nonnegative(),
  proteinG: z.number().nonnegative(),
  carbsG: z.number().nonnegative(),
  fatG: z.number().nonnegative(),
  quantity: z.number().positive().default(1),
  unit: z.string().default("serving")
});
```

When Sage returns a tool-call request, the client-side state machine intercepts it, executes the state modification, and appends a visual confirmation to the chat timeline, maintaining seamless user feedback.

---

## Chapter 4: The Culinary-to-Log Compiler (Vault Integration)

Palate stores user recipes locally as Markdown files using **Cooklang** markup. A key feature of the MyFitnessPal integration is the **Culinary-to-Log Compiler**, which automatically parses recipe instructions and scales ingredients to calculate absolute nutritional intake.

### 4.1 Cooklang Parsing Architecture
Cooklang highlights ingredients, quantities, and cookware inline:
`Add @boneless chicken breast{250%g} to a hot pan with @olive oil{1%tbsp}.`

The custom parser (`src/lib/parser.ts`) extracts these tokens:

```typescript
interface CooklangIngredient {
  name: string;
  quantity: number;
  unit: string;
}
```

### 4.2 Mathematical Recipe Scaling & Fractional Conversions
When logging a portion of a batch-cooked meal, the compiler scales the nutrition calculations. Let a recipe yield $N_{\text{total}}$ portions. If a user logs $N_{\text{logged}}$ portions, the scaling factor $S$ is defined as:

$$S = \frac{N_{\text{logged}}}{N_{\text{total}}}$$

Every ingredient macro $M_{\text{ingredient}}$ (Protein, Carbs, Fat, Calories) is scaled proportionally to compute the net consumed nutrient value ($M_{\text{consumed}}$):

$$M_{\text{consumed}} = S \times \sum_{i=1}^{I} M_{\text{ingredient}, i}$$

This enables zero-waste batch tracking, automatically adjusting remaining leftovers in the scheduled calendar plans.

---

## Chapter 5: Visual Architecture & Premium Glassmorphic HSL Design

A premium user experience requires a highly polished, responsive interface. We implement a custom Tailwind CSS v4 layout featuring **Glassmorphic HSL design variables**.

### 5.1 The Dashboard HSL Color Palette
We avoid generic colors, utilizing a custom dark mode palette with glowing primary rings:
*   **Background:** Deep Obsidian `hsl(224, 25%, 6%)`
*   **Card Backdrop:** Semi-translucent Glass `hsla(224, 25%, 12%, 0.6)`
*   **Border Glow:** High-voltage Ice `hsla(210, 100%, 80%, 0.08)`
*   **Calorie Ring:** Pure Electric Indigo `hsl(250, 95%, 60%)`
*   **Protein Arc:** Neon fuchsia `hsl(320, 95%, 55%)`
*   **Carbohydrate Arc:** Vivid Turquoise `hsl(175, 90%, 45%)`
*   **Fat Arc:** Amber Gold `hsl(40, 90%, 55%)`

### 5.2 Responsive Calorie Ring Diagram (SVG Mechanics)
Rather than relying on heavy third-party graphing libraries, we construct a lightweight, high-performance circular progress SVG using native Tailwind transitions:

```tsx
interface RingProps {
  percentage: number; // 0 to 100
  strokeWidth: number;
  radius: number;
  colorClass: string;
}

export function CircularProgressRing({ percentage, strokeWidth, radius, colorClass }: RingProps) {
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (Math.min(percentage, 100) / 100) * circumference;

  return (
    <svg className="transform -rotate-90" width={(radius + strokeWidth) * 2} height={(radius + strokeWidth) * 2}>
      {/* Background Track */}
      <circle
        className="text-slate-800"
        strokeWidth={strokeWidth}
        stroke="currentColor"
        fill="transparent"
        r={radius}
        cx={radius + strokeWidth}
        cy={radius + strokeWidth}
      />
      {/* Animated Foreground Progress */}
      <circle
        className={`${colorClass} transition-all duration-700 ease-out-back`}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={strokeDashoffset}
        strokeLinecap="round"
        stroke="currentColor"
        fill="transparent"
        r={radius}
        cx={radius + strokeWidth}
        cy={radius + strokeWidth}
      />
    </svg>
  );
}
```

---

## Chapter 6: Practical Implementation Blueprint

This chapter provides the core code implementations to build the calculations engine and Zustand store.

### 6.1 Metabolic Math Engine (`src/lib/fitnessMath.ts`)

```typescript
export interface Anthropometrics {
  birthDate: string;
  biologicalSex: 'Male' | 'Female';
  heightCm: number;
  currentWeightKg: number;
  targetWeightKg: number;
  activityLevel: 'Sedentary' | 'LightlyActive' | 'ModeratelyActive' | 'VeryActive' | 'HyperActive';
  fitnessGoal: 'FatLoss' | 'Maintenance' | 'MuscleGain';
  weeklyWeightRate: number; // in kg (e.g. 0.5)
}

export interface MacroTargets {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

/**
 * Calculates decimal age based on birthDate string
 */
export function calculateAge(birthDateStr: string): number {
  const birthDate = new Date(birthDateStr);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return Math.max(age, 1);
}

/**
 * Computes Basal Metabolic Rate using Mifflin-St Jeor equation
 */
export function calculateBMR(w: number, h: number, age: number, sex: 'Male' | 'Female'): number {
  if (sex === 'Male') {
    return (10 * w) + (6.25 * h) - (5 * age) + 5;
  } else {
    return (10 * w) + (6.25 * h) - (5 * age) - 161;
  }
}

/**
 * Maps Activity Levels to PAL coefficients
 */
export function getPAL(level: Anthropometrics['activityLevel']): number {
  const palMap = {
    Sedentary: 1.200,
    LightlyActive: 1.375,
    ModeratelyActive: 1.550,
    VeryActive: 1.725,
    HyperActive: 1.900
  };
  return palMap[level] || 1.200;
}

/**
 * Main calculation orchestration engine
 */
export function computeDailyTargets(metrics: Anthropometrics, split: 'Balanced' | 'HighProtein' | 'Keto' = 'Balanced'): MacroTargets {
  const age = calculateAge(metrics.birthDate);
  const bmr = calculateBMR(metrics.currentWeightKg, metrics.heightCm, age, metrics.biologicalSex);
  const tdee = bmr * getPAL(metrics.activityLevel);
  
  // Apply objective deltas
  let targetCalories = tdee;
  if (metrics.fitnessGoal === 'FatLoss') {
    // 1kg of fat ~ 7700 kcal. 0.5kg/week weight rate ~ 550 kcal/day deficit.
    const deficit = (metrics.weeklyWeightRate * 7700) / 7;
    targetCalories = tdee - deficit;
    
    // Metabolic floor protection
    const floor = metrics.biologicalSex === 'Male' ? 1500 : 1200;
    if (targetCalories < floor) targetCalories = floor;
  } else if (metrics.fitnessGoal === 'MuscleGain') {
    const surplus = (metrics.weeklyWeightRate * 7700) / 7;
    targetCalories = tdee + surplus;
  }
  
  const kcalTarget = Math.round(targetCalories);
  
  // Distribute macros based on diet configurations
  let pRatio = 0.30, cRatio = 0.40, fRatio = 0.30;
  if (split === 'HighProtein') {
    pRatio = 0.40; cRatio = 0.30; fRatio = 0.30;
  } else if (split === 'Keto') {
    pRatio = 0.25; cRatio = 0.05; fRatio = 0.70;
  }
  
  return {
    calories: kcalTarget,
    protein: Math.round((kcalTarget * pRatio) / 4),
    carbs: Math.round((kcalTarget * cRatio) / 4),
    fat: Math.round((kcalTarget * fRatio) / 9)
  };
}
```

---

## Conclusion & Future Horizons

By combining **local-first state architectures** with **structured generative AI modules**, Palate Diary provides a secure, zero-latency health ecosystem. Fusing deterministic bioenergetic algorithms with Sage's culinary and behavioral intelligence enables highly contextual, conversational nutrition tracking. 

This hybrid architecture points to a future where applications are not just static interfaces or ungrounded language models, but highly coordinated cognitive agents that run securely in private user sandboxes.
