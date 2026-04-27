// LLM cost calculator — model pricing table and cost computation.
//
// Pricing is in USD per 1M tokens (input / output).
// Exact match is tried first, then prefix match (e.g. "claude-sonnet-4" matches
// "claude-sonnet-4-20250514"). Unknown models return undefined — never 0 — to
// avoid showing misleadingly zero costs.
//
// Prices sourced from provider documentation. Update this table as prices change.

// ─── Pricing table ────────────────────────────────────────────────────────────

interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
}

// Keys are matched: exact first, then prefix (longest prefix wins).
// Use the shortest stable prefix that uniquely identifies a model tier.
const PRICING: Record<string, ModelPricing> = {
  // Anthropic Claude 4.x
  'claude-opus-4': { inputPerMillion: 15, outputPerMillion: 75 },
  'claude-sonnet-4': { inputPerMillion: 3, outputPerMillion: 15 },
  'claude-haiku-4': { inputPerMillion: 0.8, outputPerMillion: 4 },

  // Anthropic Claude 3.x (legacy)
  // Real Anthropic model IDs are "claude-3-<tier>-<date>" — prefix must match from the left.
  'claude-3-5-sonnet': { inputPerMillion: 3, outputPerMillion: 15 },
  'claude-3-5-haiku': { inputPerMillion: 0.8, outputPerMillion: 4 },
  'claude-3-opus': { inputPerMillion: 15, outputPerMillion: 75 },
  'claude-3-sonnet': { inputPerMillion: 3, outputPerMillion: 15 },
  'claude-3-haiku': { inputPerMillion: 0.25, outputPerMillion: 1.25 },

  // OpenAI GPT-4o
  'gpt-4o-mini': { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  'gpt-4o': { inputPerMillion: 2.5, outputPerMillion: 10 },

  // OpenAI o-series
  'o3-mini': { inputPerMillion: 1.1, outputPerMillion: 4.4 },
  'o3': { inputPerMillion: 10, outputPerMillion: 40 },
  'o1-mini': { inputPerMillion: 1.1, outputPerMillion: 4.4 },
  'o1': { inputPerMillion: 15, outputPerMillion: 60 },

  // OpenAI GPT-3.5
  'gpt-3.5-turbo': { inputPerMillion: 0.5, outputPerMillion: 1.5 },

  // Google Gemini
  'gemini-2.5-pro': { inputPerMillion: 1.25, outputPerMillion: 10 },
  'gemini-2.5-flash': { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  'gemini-2.0-flash': { inputPerMillion: 0.1, outputPerMillion: 0.4 },
  'gemini-1.5-pro': { inputPerMillion: 1.25, outputPerMillion: 5 },
  'gemini-1.5-flash': { inputPerMillion: 0.075, outputPerMillion: 0.3 },
};

// ─── Lookup ───────────────────────────────────────────────────────────────────

function lookupPricing(model: string): ModelPricing | undefined {
  const lower = model.toLowerCase();

  // 1. Exact match
  if (lower in PRICING) return PRICING[lower];

  // 2. Prefix match — find the longest key that is a prefix of the model name
  let best: ModelPricing | undefined;
  let bestLen = 0;
  for (const [key, pricing] of Object.entries(PRICING)) {
    if (lower.startsWith(key) && key.length > bestLen) {
      best = pricing;
      bestLen = key.length;
    }
  }
  return best;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Calculate the estimated USD cost for a single LLM API call.
 * Returns undefined if the model is not in the pricing table — never returns 0
 * for an unknown model to avoid misleading zero-cost displays in the dashboard.
 */
export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number | undefined {
  const pricing = lookupPricing(model);
  if (!pricing) return undefined;

  const inputCost = (inputTokens / 1_000_000) * pricing.inputPerMillion;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPerMillion;
  return inputCost + outputCost;
}

/**
 * Returns true if we have pricing data for the given model.
 * Useful for UI to distinguish "free" (tokens = 0) from "unknown model".
 */
export function hasPricing(model: string): boolean {
  return lookupPricing(model) !== undefined;
}
