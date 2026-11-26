/**
 * Gemini client wrapper (§6.2, §6.5).
 * Confines SDK-specific syntax to this file so other modules don't import @google/genai directly.
 */
import { GoogleGenAI, Type, ThinkingLevel, type FunctionDeclaration, type ThinkingConfig } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY ?? "";
const modelId = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
const fallbackModelId = process.env.GEMINI_MODEL_FALLBACK ?? "gemini-2.0-flash";

let client: GoogleGenAI | null = null;

/**
 * Gemini 3.5+ thinks by default; low keeps output budget for the structured plan.
 * Older Flash models use an explicit zero thinking budget.
 */
function thinkingConfig(model: string): ThinkingConfig {
  return model.startsWith("gemini-3")
    ? { thinkingLevel: ThinkingLevel.LOW }
    : { thinkingBudget: 0 };
}

function getClient(): GoogleGenAI | null {
  if (!apiKey) return null;
  if (!client) client = new GoogleGenAI({ apiKey });
  return client;
}

export interface GenerateOptions {
  systemPrompt: string;
  userPrompt: string;
  jsonSchema?: Record<string, unknown>;
  maxOutputTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

export interface GenerateResult {
  text: string;
  tokensIn?: number;
  tokensOut?: number;
}

/** Generate structured output with Gemini. Returns null if no API key or on failure. */
export async function generate(opts: GenerateOptions): Promise<GenerateResult | null> {
  const ai = getClient();
  if (!ai) return null;

  const timeoutMs = opts.timeoutMs ?? 12000;

  const call = async (model: string): Promise<GenerateResult> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const result = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: opts.userPrompt }] }],
        config: {
          systemInstruction: opts.systemPrompt,
          maxOutputTokens: opts.maxOutputTokens ?? 3200,
          temperature: opts.temperature ?? 0.3,
          responseMimeType: opts.jsonSchema ? "application/json" : undefined,
          responseJsonSchema: opts.jsonSchema,
          thinkingConfig: thinkingConfig(model),
          abortSignal: controller.signal,
          httpOptions: { timeout: timeoutMs },
        },
      });
      return {
        text: result.text ?? "",
        tokensIn: result.usageMetadata?.promptTokenCount,
        tokensOut: result.usageMetadata?.candidatesTokenCount,
      };
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    return await call(modelId);
  } catch (err) {
    try {
      return await call(fallbackModelId);
    } catch {
      console.error("Both Gemini models failed:", err);
      return null;
    }
  }
}

const SIMULATE_SCENARIO_DECL: FunctionDeclaration = {
  name: "simulate_scenario",
  description: "Run the AirCompass exposure engine with modified household/commute parameters and return before/after PM2.5 exposure.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      windowsOpenHours: { type: Type.ARRAY, items: { type: Type.INTEGER }, description: "Hours 0-23 when windows are open" },
      purifier: { type: Type.STRING, description: "none, hepa, or diy" },
      exerciseHour: { type: Type.INTEGER, description: "Hour 0-23 for exercise" },
      exerciseIndoors: { type: Type.BOOLEAN, description: "Whether exercise is done indoors" },
      commuteMode: { type: Type.STRING, description: "walk, cycle, two_wheeler, auto, bus, metro, car, or wfh" },
      commuteDaysPerWeek: { type: Type.INTEGER, description: "Commute days per week (0-7)" },
      n95Outdoors: { type: Type.BOOLEAN, description: "Whether an N95 mask is worn outdoors" },
      cookVent: { type: Type.BOOLEAN, description: "Whether kitchen exhaust is used" },
    },
  },
};

export interface ChatTurnResult {
  text: string;
  toolUsed: boolean;
  toolNumbers: number[];
  tokensOut?: number;
}

/** Chat with up to 2 rounds of simulate_scenario function calling. */
export async function generateChatWithTools(
  systemPrompt: string,
  userPrompt: string,
  runTool: (args: Record<string, unknown>) => { before: number; after: number; delta: number; pct: number; assumptions: string[] },
  maxOutputTokens = 800,
): Promise<ChatTurnResult | null> {
  const ai = getClient();
  if (!ai) return null;

  const contents: Array<{ role: "user" | "model"; parts: Array<Record<string, unknown>> }> = [
    { role: "user", parts: [{ text: userPrompt }] },
  ];
  let toolUsed = false;
  const toolNumbers: number[] = [];

  for (let round = 0; round < 3; round++) {
    try {
      const res = await ai.models.generateContent({
        model: modelId,
        contents,
        config: {
          systemInstruction: systemPrompt,
          maxOutputTokens,
          temperature: 0.4,
          tools: [{ functionDeclarations: [SIMULATE_SCENARIO_DECL] }],
          thinkingConfig: thinkingConfig(modelId),
          httpOptions: { timeout: 12000 },
        },
      });

      const call = res.functionCalls?.[0];
      if (call && call.name === "simulate_scenario" && round < 2) {
        toolUsed = true;
        const args = (call.args ?? {}) as Record<string, unknown>;
        const toolResult = runTool(args);
        toolNumbers.push(toolResult.before, toolResult.after, toolResult.delta, toolResult.pct, Math.abs(toolResult.delta), Math.abs(toolResult.pct));

        contents.push({ role: "model", parts: [{ functionCall: call }] });
        contents.push({
          role: "user",
          parts: [{ functionResponse: { name: "simulate_scenario", response: toolResult } }],
        });
        continue;
      }

      return {
        text: res.text ?? "",
        toolUsed,
        toolNumbers,
        tokensOut: res.usageMetadata?.candidatesTokenCount,
      };
    } catch {
      return null;
    }
  }
  return null;
}

/** Check if Gemini API is available */
export function isAvailable(): boolean {
  return !!apiKey;
}
