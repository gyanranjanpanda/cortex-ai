import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatGroq } from "@langchain/groq";
import { ChatDeepSeek } from "@langchain/deepseek";
import dotenv from "dotenv";
dotenv.config();

// ─── Model Definitions ────────────────────────────────────────────────────────

// Gemini 2.5 Flash — free (1500 req/day), excellent at complex code & reasoning
const gemini = new ChatGoogleGenerativeAI({
  model: "gemini-2.5-flash",
  apiKey: process.env.GOOGLE_API_KEY || "placeholder_key",
  maxOutputTokens: 8192,
});

// Groq LLaMA 3.3 70b — very fast, generous free tier, good for chat/search
const groq = new ChatGroq({
  model: "llama-3.3-70b-versatile",
  temperature: 0,
  maxTokens: 4096,
  maxRetries: 0, // disable built-in retry so our fallback chain controls it
});

// DeepSeek V3 — direct API, best coding quality, used as last-resort fallback
const deepseek = new ChatDeepSeek({
  model: "deepseek-chat",
  apiKey: process.env.DEEPSEEK_API_KEY,
  temperature: 0,
  maxTokens: 8192,
});

export { gemini };

// ─── Fallback Chain ───────────────────────────────────────────────────────────

/**
 * Wraps multiple models into a single callable.
 * Tries each model in order. If one fails (rate limit, quota, network),
 * it logs the failure and automatically moves to the next one.
 *
 * Usage: same as any LangChain model — just call .invoke(prompt)
 */
function withFallback(models) {
  return {
    async invoke(prompt) {
      for (let i = 0; i < models.length; i++) {
        const { model, name } = models[i];
        try {
          console.log(`[model] using ${name}`);
          const result = await model.invoke(prompt);
          return result;
        } catch (err) {
          const isLastModel = i === models.length - 1;
          console.warn(`[model] ${name} failed: ${err.message}`);
          if (isLastModel) {
            throw new Error(`All models exhausted. Last error: ${err.message}`);
          }
          console.log(`[model] falling back to ${models[i + 1].name}...`);
        }
      }
    },
  };
}

// ─── Agent → Model Chains ─────────────────────────────────────────────────────

// Coding: DeepSeek primary (best code quality) → Gemini fallback → Groq last resort
const codingChain = withFallback([
  { model: deepseek, name: "DeepSeek V3" },
  { model: gemini,   name: "Gemini 2.5 Flash" },
  { model: groq,     name: "Groq LLaMA 3.3 70b" },
]);

// PDF: DeepSeek primary (best structured long-form content) → Gemini → Groq
const pdfChain = withFallback([
  { model: deepseek, name: "DeepSeek V3" },
  { model: gemini,   name: "Gemini 2.5 Flash" },
  { model: groq,     name: "Groq LLaMA 3.3 70b" },
]);

// PPT: DeepSeek primary (best structured slide content) → Gemini → Groq
const pptChain = withFallback([
  { model: deepseek, name: "DeepSeek V3" },
  { model: gemini,   name: "Gemini 2.5 Flash" },
  { model: groq,     name: "Groq LLaMA 3.3 70b" },
]);

// Chat / Search: Groq first (fastest, free) → Gemini fallback
const chatChain = withFallback([
  { model: groq,   name: "Groq LLaMA 3.3 70b" },
  { model: gemini, name: "Gemini 2.5 Flash" },
]);

// Vision: Gemini only (only multimodal model configured)
const visionChain = withFallback([
  { model: gemini, name: "Gemini 2.5 Flash" },
]);

// ─── Public API ───────────────────────────────────────────────────────────────

export const getModel = (agent) => {
  switch (agent) {
    case "coding": return codingChain;
    case "pdf":    return pdfChain;
    case "ppt":    return pptChain;
    case "router": return chatChain;
    case "chat":   return chatChain;
    case "search": return chatChain;
    case "image":  return chatChain;
    case "vision": return visionChain;
    default:       return chatChain;
  }
};