import { isPromptInjection, sanitizePII } from "./inputSecurity.js";

export const assessRisk = ({ text = "", source = "request", errorCode } = {}) => {
  const value = typeof text === "string" ? text : String(text ?? "");
  const normalized = value.normalize("NFKC").toLowerCase();
  const pii = sanitizePII(value).findings;
  const disclosure = ["you are cortexai", "system prompt", "developer message", "if searchcontext exists"]
    .filter((signal) => normalized.includes(signal)).length >= 2;

  if (errorCode === "PROMPT_TOO_LARGE" || value.length > Number(process.env.MAX_PROMPT_LENGTH || 12000)) {
    return { score: 0.9, category: "Context Overflow", action: "Blocked", reason: "Prompt exceeds the configured limit" };
  }
  if (disclosure) {
    return { score: 0.98, category: "Output Leakage", action: "Blocked", reason: "Internal instruction disclosure detected" };
  }
  if (isPromptInjection(value)) {
    const category = /system\s*prompt|developer\s*message/i.test(value)
      ? "System Prompt Extraction"
      : source === "rag" ? "Indirect RAG Injection" : "Prompt Injection";
    return { score: 0.95, category, action: "Blocked", reason: "Instruction hierarchy override detected" };
  }
  if (pii.length) return { score: 0.45, category: "PII", action: "Redacted", reason: pii.join(", ") };
  return { score: 0.02, category: "Normal", action: "Allowed", reason: "No deterministic risk indicator" };
};
