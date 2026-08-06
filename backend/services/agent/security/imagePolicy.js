import { securityError } from "./errors.js";

// ─── Provenance ───────────────────────────────────────────────────────────────
// Increment when detection logic, weights, or policy thresholds change.
// Every decision records these so any block can be reproduced exactly.
const NORMALIZER_VERSION = "2";
const LEXICAL_VERSION    = "1";
const POLICY_VERSION     = "2026-08";

// ─── Mathematical Unicode Fold ────────────────────────────────────────────────
// NFKC normalizes fullwidth (ＮＳＦＷ → NSFW) but not Mathematical Alphanumeric
// Symbols (U+1D400–U+1D7FF). Attackers spell "𝗡𝗦𝗙𝗪" or "𝓝𝓢𝓕𝓦" to bypass
// keyword filters. This table folds the most-used variants to ASCII equivalents.
const MATH_FOLD = Object.freeze({
  // Mathematical Sans-Serif Bold (𝗔–𝗭, 𝗮–𝘇)
  '𝗔':'a','𝗕':'b','𝗖':'c','𝗗':'d','𝗘':'e','𝗙':'f','𝗚':'g','𝗛':'h','𝗜':'i','𝗝':'j',
  '𝗞':'k','𝗟':'l','𝗠':'m','𝗡':'n','𝗢':'o','𝗣':'p','𝗤':'q','𝗥':'r','𝗦':'s','𝗧':'t',
  '𝗨':'u','𝗩':'v','𝗪':'w','𝗫':'x','𝗬':'y','𝗭':'z',
  '𝗮':'a','𝗯':'b','𝗰':'c','𝗱':'d','𝗲':'e','𝗳':'f','𝗴':'g','𝗵':'h','𝗶':'i','𝗷':'j',
  '𝗸':'k','𝗹':'l','𝗺':'m','𝗻':'n','𝗼':'o','𝗽':'p','𝗾':'q','𝗿':'r','𝘀':'s','𝘁':'t',
  '𝘂':'u','𝘃':'v','𝘄':'w','𝘅':'x','𝘆':'y','𝘇':'z',
  // Mathematical Bold Script (𝓐–𝓩)
  '𝓐':'a','𝓑':'b','𝓒':'c','𝓓':'d','𝓔':'e','𝓕':'f','𝓖':'g','𝓗':'h','𝓘':'i','𝓙':'j',
  '𝓚':'k','𝓛':'l','𝓜':'m','𝓝':'n','𝓞':'o','𝓟':'p','𝓠':'q','𝓡':'r','𝓢':'s','𝓣':'t',
  '𝓤':'u','𝓥':'v','𝓦':'w','𝓧':'x','𝓨':'y','𝓩':'z',
  // Mathematical Bold (𝐀–𝐙)
  '𝐀':'a','𝐁':'b','𝐂':'c','𝐃':'d','𝐄':'e','𝐅':'f','𝐆':'g','𝐇':'h','𝐈':'i','𝐉':'j',
  '𝐊':'k','𝐋':'l','𝐌':'m','𝐍':'n','𝐎':'o','𝐏':'p','𝐐':'q','𝐑':'r','𝐒':'s','𝐓':'t',
  '𝐔':'u','𝐕':'v','𝐖':'w','𝐗':'x','𝐘':'y','𝐙':'z',
  // Cyrillic lookalikes used in mixed-script evasion
  'а':'a','е':'e','і':'i','о':'o','р':'r','с':'c','у':'u','х':'x',
});

// ─── Normalizer ───────────────────────────────────────────────────────────────
// Returns a canonical lowercase string safe for deterministic pattern matching.
// Called once per request; the result is reused for all signal checks.
const normalize = (value) => {
  // Array spread correctly handles supplementary-plane (surrogate-pair) chars.
  let text = [...String(value || "")].map((ch) => MATH_FOLD[ch] ?? ch).join("");

  return text
    .normalize("NFKC")
    // Decode literal escape sequences such as \u006e injected in raw strings.
    .replace(/\\u([0-9a-f]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    // Remove zero-width / BOM characters used for invisible word splitting.
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .toLowerCase()
    // Collapse single-letter tokens separated by spaces, dots, hyphens, underscores.
    // Converts "N S F W", "N-S-F-W", "N.S.F.W" → "nsfw" after lowercasing.
    .replace(/(?<![a-z])([a-z])(?:[\s.\-_]+([a-z])){2,}(?![a-z])/g, (m) =>
      m.replace(/[\s.\-_]+/g, "")
    )
    .replace(/\s+/g, " ")
    .trim();
};

// ─── Risk Dimensions ──────────────────────────────────────────────────────────
// Maps safety categories to their slot in the risk vector.
const RISK_DIMENSION = Object.freeze({
  "Explicit Sexual Content": "sexual",
  "Age Ambiguity":           "minor",
  "Graphic Violence":        "violence",
  "Identity Document":       "fraud",
  "Real Celebrity":          "celebrity",
});

// ─── Lexical Signal Definitions ───────────────────────────────────────────────
// Each entry maps a deterministic pattern to a safety category and base weight.
// Rule IDs are stable — never reuse a retired ID across versions.
// Weight is the maximum risk contribution when this rule matches alone at full confidence.
const SIGNAL_DEFINITIONS = Object.freeze([
  {
    rule: "IMG-001",
    category: "Explicit Sexual Content",
    weight: 0.95,
    pattern: /\b(?:nude|nudity|nsfw|porn(?:ographic)?|hentai|sex(?:ual)?|explicit|genital|erotic|fetish|ecchi|lewd|sensual|fanservice|suggestive|lingerie|uncensored|intimate|revealing\s+clothing|boudoir|seductive|alluring|provocative|risqu[eé]|undress(?:ing)?|after\s+bathing|barely\s+clothed|transparent\s+clothes|topless|bottomless)\b/i,
  },
  {
    rule: "IMG-002",
    category: "Age Ambiguity",
    weight: 1.00, // absolute — any match hard-blocks regardless of other signals
    pattern: /\b(?:teen|minor|child|kid|underage|loli|shota|schoolgirl|schoolboy|jailbait|preteen|juvenile)\b/i,
  },
  {
    rule: "IMG-003",
    category: "Graphic Violence",
    weight: 0.88,
    pattern: /\b(?:gore|dismember|decapitat|bloodbath|extreme\s+violence|snuff|torture\s+scene)\b/i,
  },
  {
    rule: "IMG-004",
    category: "Identity Document",
    weight: 0.93,
    pattern: /\b(?:fake|forged|counterfeit)\s+(?:(?:government|national|official)\s+)?(?:id|passport|license|government\s+document|identity\s+card)\b/i,
  },
  {
    rule: "IMG-005",
    category: "Real Celebrity",
    weight: 0.82,
    pattern: /\b(?:deepfake|(?:nude|naked|explicit|sexual)\s+(?:photo|image|portrait)\s+of\s+(?:a\s+)?(?:celebrity|famous)|put\s+(?:celebrity|famous\s+person))\b/i,
  },
]);

// ─── Combination Escalation Rules ─────────────────────────────────────────────
// Applied after base scoring. These encode hard policy that lexical patterns
// alone cannot express. Each combination emits its own evidence item.
// Combinations can only raise risk — never lower it.
const COMBINATION_RULES = Object.freeze([
  {
    rule: "COMB-001",
    description: "Sexual content involving minors — absolute block",
    requires: ["Explicit Sexual Content", "Age Ambiguity"],
    forceRisk: 1.00,
    forceAction: "BLOCK",
  },
  {
    rule: "COMB-002",
    description: "Explicit content targeting real celebrities",
    requires: ["Explicit Sexual Content", "Real Celebrity"],
    forceRisk: 1.00,
    forceAction: "BLOCK",
  },
]);

// ─── Anime Context Detection ──────────────────────────────────────────────────
// Expanded beyond core terms to cover common evasion vocabulary such as
// "doujin", "otaku", "vn", and "cel shading".
const ANIME_CONTEXT_RE =
  /\b(?:anime|manga|hentai|ecchi|illustration|waifu|fanart|doujin|otaku|japanese\s+comic|visual\s+novel|\bvn\b|cel\s+shading|toon|kawaii)\b/i;

// Conservative adult signal set — ambiguous terms (bikini, bedroom, revealing)
// are intentionally excluded to reduce false-positive rate.
const ADULT_ANIME_RE =
  /(?:r?18\s*\+|r18|\b(?:adult|nsfw|erotic|lewd|hentai|ecchi|uncensored|explicit|nude|nudity|undress(?:ing)?|topless|boudoir|barely\s+clothed|transparent\s+clothes|after\s+bathing)\b)/i;

// ─── Action + Severity Derivation ─────────────────────────────────────────────
const deriveAction = (risk) => {
  if (risk >= 0.90) return "BLOCK";
  if (risk >= 0.65) return "REVIEW";
  if (risk >= 0.40) return "ALLOW_WITH_WARNING";
  return "ALLOW";
};

const deriveSeverity = (action) => {
  if (action === "BLOCK" || action === "REVIEW") return "HIGH";
  if (action === "ALLOW_WITH_WARNING") return "MEDIUM";
  return "LOW";
};

// ─── Classifier ───────────────────────────────────────────────────────────────
export const classifyImagePrompt = (prompt) => {
  const normalized = normalize(prompt);
  const compact    = normalized.replace(/\s/g, "");
  const evidence   = [];

  // Run every lexical definition against normalized and compact forms.
  // exec() captures the matched text for inclusion in the evidence object.
  for (const def of SIGNAL_DEFINITIONS) {
    const hit = def.pattern.exec(normalized) ?? def.pattern.exec(compact);
    if (hit) {
      evidence.push({
        source:     "lexical",
        rule:       def.rule,
        category:   def.category,
        matched:    hit[0],
        weight:     def.weight,
        confidence: 1.0,
      });
    }
  }

  // Infer Explicit Sexual Content when adult vocabulary accompanies an anime
  // context marker not caught by direct patterns (e.g. "doujin 18+", "otaku adult art").
  if (
    ANIME_CONTEXT_RE.test(normalized) &&
    ADULT_ANIME_RE.test(normalized) &&
    !evidence.some((e) => e.category === "Explicit Sexual Content")
  ) {
    evidence.push({
      source:      "lexical",
      rule:        "IMG-006",
      category:    "Explicit Sexual Content",
      matched:     "anime + adult context",
      weight:      0.95,
      confidence:  0.85,  // inferred, not a direct lexical match
    });
  }

  // Compact fallback for unambiguous keywords embedded in compound tokens
  // such as "nudeanime" or "hentai-style" where word boundaries don't apply.
  for (const keyword of ["nude", "nsfw", "hentai"]) {
    if (compact.includes(keyword) && !evidence.some((e) => e.category === "Explicit Sexual Content")) {
      evidence.push({
        source:     "lexical",
        rule:       "IMG-001",
        category:   "Explicit Sexual Content",
        matched:    keyword,
        weight:     0.95,
        confidence: 1.0,
      });
      break;
    }
  }

  // Build per-category risk vector.
  const riskVector = { sexual: 0, minor: 0, violence: 0, fraud: 0, celebrity: 0 };
  const detectedCategories = new Set();

  for (const item of evidence) {
    const dim = RISK_DIMENSION[item.category];
    if (dim) riskVector[dim] = Math.max(riskVector[dim], item.weight * item.confidence);
    detectedCategories.add(item.category);
  }

  // Apply combination escalation rules. Each matching rule appends its own
  // evidence item — the audit log shows exactly why the risk was raised.
  let forcedAction = null;
  let forcedRisk   = 0;

  for (const rule of COMBINATION_RULES) {
    if (rule.requires.every((cat) => detectedCategories.has(cat))) {
      evidence.push({
        source:      "combination",
        rule:        rule.rule,
        description: rule.description,
        forceRisk:   rule.forceRisk,
        forceAction: rule.forceAction,
      });
      if (!forcedAction) forcedAction = rule.forceAction;
      forcedRisk = Math.max(forcedRisk, rule.forceRisk);
    }
  }

  const baseRisk = Math.max(...Object.values(riskVector), forcedRisk, 0);
  const risk     = Math.round(baseRisk * 1000) / 1000;
  const action   = forcedAction ?? deriveAction(risk);
  const severity = deriveSeverity(action);
  const categories = [...detectedCategories];

  return {
    modality:   "image",
    evidence,
    categories,
    signals:    categories, // stable alias kept for backward compatibility
    riskVector,
    risk,
    severity,
    action,
    subcategory: evidence.find((e) => e.rule === "IMG-006")
      ? "Anime / Age Ambiguous"
      : categories.length ? "General" : null,
    reason: categories.length ? categories.join(", ") : "No image policy violation detected",
    provenance: {
      normalizerVersion: NORMALIZER_VERSION,
      lexicalVersion:    LEXICAL_VERSION,
      policyVersion:     POLICY_VERSION,
    },
  };
};

// ─── Synchronous Enforcement ──────────────────────────────────────────────────
// Throws for BLOCK and REVIEW — both require the pipeline to stop.
// ALLOW_WITH_WARNING proceeds; the caller receives the full decision object.
export const enforceImagePromptPolicy = (prompt) => {
  const decision = classifyImagePrompt(prompt);
  if (decision.action === "BLOCK" || decision.action === "REVIEW") {
    throw securityError(403, "This image request is not allowed by the image safety policy.", "IMAGE_POLICY_DENIED");
  }
  return decision;
};

// ─── Risk Vector Merge ────────────────────────────────────────────────────────
// Takes the maximum per-dimension — a semantic classifier can only raise risk,
// never cancel a lexical hit.
const mergeRiskVectors = (a = {}, b = {}) => {
  const merged = { ...a };
  for (const [key, val] of Object.entries(b)) {
    merged[key] = Math.max(merged[key] ?? 0, val);
  }
  return merged;
};

// ─── Async Enforcement (with optional semantic classifier) ────────────────────
// The lexical pass runs first via enforceImagePromptPolicy — if it blocks,
// the classifier is never called. When IMAGE_CLASSIFIER_URL is set, semantic
// evidence is merged into the local decision and the policy is re-evaluated.
//
// Expected classifier response shape (all fields optional):
//   { evidence?, categories?, signals?, riskVector?, action?, severity? }
export const enforceImagePromptPolicyAsync = async (prompt) => {
  const local    = enforceImagePromptPolicy(prompt);
  const endpoint = process.env.IMAGE_CLASSIFIER_URL;

  if (!endpoint) {
    // The remote semantic classifier is optional infrastructure.
    // Only block when IMAGE_CLASSIFIER_REQUIRED is explicitly "true" —
    // defaulting to required-in-production blocked every image request
    // when no classifier service is deployed (same pattern as imageModeration.js).
    const required = process.env.IMAGE_CLASSIFIER_REQUIRED === "true";
    if (required) throw securityError(503, "Image semantic classifier is unavailable.", "IMAGE_CLASSIFIER_UNAVAILABLE");
    return local;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ modality: "image", text: prompt }),
    signal: AbortSignal.timeout(Number(process.env.IMAGE_CLASSIFIER_TIMEOUT_MS || 2500)),
  });
  if (!response.ok) throw securityError(503, "Image semantic classifier failed.", "IMAGE_CLASSIFIER_UNAVAILABLE");

  const semantic     = await response.json();
  const mergedVector = mergeRiskVectors(local.riskVector, semantic.riskVector);
  const mergedMax    = Math.max(...Object.values(mergedVector), 0);

  const merged = {
    ...local,
    ...semantic,
    evidence:   [...(local.evidence   ?? []), ...(semantic.evidence   ?? [])],
    categories: [...new Set([...(local.categories ?? []), ...(semantic.categories ?? [])])],
    signals:    [...new Set([...(local.signals    ?? []), ...(semantic.signals    ?? [])])],
    riskVector: mergedVector,
    risk:       Math.round(mergedMax * 1000) / 1000,
  };
  merged.action   = deriveAction(merged.risk);
  merged.severity = deriveSeverity(merged.action);

  if (merged.action === "BLOCK" || merged.action === "REVIEW") {
    throw securityError(403, "This image request is not allowed by the image safety policy.", "IMAGE_POLICY_DENIED");
  }
  return merged;
};
