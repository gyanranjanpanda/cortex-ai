import { securityError } from "./errors.js";

const injectionPatterns = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions/i,
  /system\s*(prompt|message)\s*:/i,
  /reveal\s+(your\s+)?(system\s+)?prompt/i,
  /\b(jailbreak|developer\s+message)\b/i,
  /<\/?\s*(?:system|assistant|developer|tool)\b[^>]*>/i,
  /["']role["']\s*:\s*["'](?:system|developer|tool)["']/i,
  /```\s*(?:system|assistant|developer|tool)\b/i,
  /\b(?:act|roleplay|pretend)\s+as\b.{0,100}\b(?:ignore|override|bypass|without)\b/i,
  /\b(?:administrator|admin|developer|security\s+team)\b.{0,100}\b(?:reveal|ignore|bypass|override)\b/i,
];

const piiPatterns = [
  { name: "EMAIL", pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
  { name: "PHONE", pattern: /(?<!\d)(?:\+?\d[\d .()-]{7,}\d)(?!\d)/g },
  { name: "CARD", pattern: /\b(?:\d[ -]*?){13,19}\b/g },
  { name: "AADHAAR", pattern: /\b\d{4}[ -]?\d{4}[ -]?\d{4}\b/g },
];

// Normalize compatibility characters and remove invisible format controls before
// evaluating a prompt. The original prompt is retained for normal processing.
const normalizeForInspection = (value) => value
  .normalize("NFKC")
  .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "");

export const isPromptInjection = (value) => {
  if (typeof value !== "string") return false;
  const inspectablePrompt = normalizeForInspection(value);
  if (injectionPatterns.some((pattern) => pattern.test(inspectablePrompt))) return true;

  // Attackers frequently encode the same instruction in Base64. Decode only
  // plausible payloads and inspect the decoded text using the same rules.
  const candidates = inspectablePrompt.match(/\b[A-Za-z0-9+/]{24,}={0,2}\b/g) || [];
  return candidates.some((candidate) => {
    try {
      const decoded = Buffer.from(candidate, "base64").toString("utf8");
      return decoded !== candidate && injectionPatterns.some((pattern) => pattern.test(normalizeForInspection(decoded)));
    } catch {
      return false;
    }
  });
};

export const sanitizePII = (value) => {
  if (typeof value !== "string") return { value, findings: [] };
  const findings = [];
  let sanitized = value;
  for (const { name, pattern } of piiPatterns) {
    sanitized = sanitized.replace(pattern, (match) => {
      findings.push(name);
      return `[REDACTED_${name}]`;
    });
  }
  return { value: sanitized, findings: [...new Set(findings)] };
};

export const securePrompt = (prompt) => {
  if (typeof prompt !== "string" || !prompt.trim()) {
    throw securityError(400, "A non-empty prompt is required.", "INVALID_PROMPT");
  }
  if (prompt.length > Number(process.env.MAX_PROMPT_LENGTH || 12000)) {
    throw securityError(413, "Prompt exceeds the maximum allowed length.", "PROMPT_TOO_LARGE");
  }
  if (isPromptInjection(prompt)) {
    throw securityError(400, "Prompt was blocked by the security policy.", "PROMPT_INJECTION_BLOCKED");
  }
  return sanitizePII(prompt);
};

export const sanitizeUntrustedText = (value) => {
  const { value: sanitized } = sanitizePII(typeof value === "string" ? value : String(value ?? ""));
  return sanitized.replace(/<\/?(?:system|assistant|tool)[^>]*>/gi, "");
};
