import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { config } from "./config.js";

/** Null when no ANTHROPIC_API_KEY: callers fall back to deterministic rules. */
export const anthropic: Anthropic | null = config.anthropicKey
  ? new Anthropic({ apiKey: config.anthropicKey, timeout: 45_000, maxRetries: 1 })
  : null;

// Circuit breaker: auth/billing errors (e.g. "credit balance too low") disable the LLM for a while
// so every tick doesn't pay a failed round-trip; decisions are labelled engine:"rules" meanwhile.
let disabledUntil = 0;
export const llmEnabled = () => anthropic !== null && Date.now() >= disabledUntil;

export function noteLlmError(e: unknown) {
  if (e instanceof Anthropic.APIError) {
    const fatal = e.status === 401 || e.status === 403 || (e.status === 400 && /credit|billing|api key/i.test(e.message));
    if (fatal) {
      disabledUntil = Date.now() + 10 * 60_000;
      console.warn(`[llm] ${e.status} ${e.message.slice(0, 160)} -> LLM disabled for 10 min, using rules`);
      return;
    }
    console.warn(`[llm] API error ${e.status}: ${e.message.slice(0, 200)}; using rules`);
  } else console.warn("[llm] failed; using rules:", (e as Error)?.message);
}

// Server-side refusal fallback ("default" routing). If the call still fails/refuses, callers use rules.
export const FALLBACK_BETAS: Anthropic.Beta.AnthropicBeta[] = ["server-side-fallback-2026-07-01"];

/** One structured-output call. Returns null on any failure/refusal so the pipeline degrades to rules. */
export async function structuredCall<T extends z.ZodType>(opts: {
  schema: T;
  system: string;
  user: string;
  model?: string;
  maxTokens?: number;
}): Promise<z.infer<T> | null> {
  if (!anthropic || !llmEnabled()) return null;
  try {
    const res = await anthropic.beta.messages.parse({
      model: opts.model ?? config.analystModel,
      max_tokens: opts.maxTokens ?? 4000,
      betas: FALLBACK_BETAS,
      fallbacks: "default",
      system: opts.system,
      output_config: { effort: "low", format: betaZodOutputFormat(opts.schema) },
      messages: [{ role: "user", content: opts.user }],
    });
    if (res.stop_reason === "refusal" || res.stop_reason === "max_tokens") {
      console.warn(`[llm] stop_reason=${res.stop_reason}; using rules`);
      return null;
    }
    return (res.parsed_output as z.infer<T> | null) ?? null;
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) console.warn("[llm] rate limited; using rules");
    else if (e instanceof Anthropic.APIConnectionError) console.warn("[llm] connection error; using rules");
    else noteLlmError(e);
    return null;
  }
}

export const jsonReplacer = (_k: string, v: unknown) => (typeof v === "bigint" ? v.toString() : v);
