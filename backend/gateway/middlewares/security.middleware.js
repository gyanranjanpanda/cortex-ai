const injectionPatterns = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions/i,
  /system\s*(prompt|message)\s*:/i,
  /reveal\s+(your\s+)?(system\s+)?prompt/i,
  /\b(jailbreak|developer\s+message)\b/i,
];

// Multipart prompt fields are inspected by the agent service after Multer parses them.
export const inspectJsonPrompt = (req, res, next) => {
  const prompt = req.body?.prompt;
  if (typeof prompt === "string" && injectionPatterns.some((pattern) => pattern.test(prompt))) {
    return res.status(400).json({ success: false, code: "PROMPT_INJECTION_BLOCKED", message: "Prompt was blocked by the security policy." });
  }
  next();
};
