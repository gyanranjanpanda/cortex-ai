import { getModel } from "./model.js";

/**
 * Multi-agent debate pipeline for code generation.
 *
 * All three rounds use the fallback chain defined in model.js:
 *   - Architect & Coder: getModel("coding")  → Gemini → Groq → DeepSeek
 *   - Critic:            getModel("chat")     → Groq → Gemini
 *
 * If Gemini quota is exceeded mid-debate, every round automatically
 * retries with the next model in the chain — no manual intervention needed.
 *
 * This pipeline is UNIVERSAL — it applies to any code generation request,
 * not just games. The output format is passed in by the caller.
 */
export async function debateAndCode(userPrompt, outputFormat) {
  const architectModel = getModel("chat");    // Groq LLaMA — fast planner
  const criticModel    = getModel("coding");  // DeepSeek — deep reviewer
  const coderModel     = getModel("coding");  // DeepSeek — writes the final code



  // ── Round 1: Architect ─────────────────────────────────────────────────────
  console.log("[debate] Round 1 — Architect planning...");

  const architectPrompt = `You are a senior software architect.

The user wants to build: "${userPrompt}"

Your job is NOT to write code yet. Your job is to produce a clear, detailed PLAN.

Respond with:

## Intent
What exactly are we building?

## Tech Stack
Which HTML/CSS/JS APIs, Canvas methods, libraries, or browser APIs will be used? Why?

## Components
List every major component with its responsibility.

## Algorithms & Data Structures
Describe the core logic in detail (state machines, data structures, rendering pipeline, etc.).

## Edge Cases & Pitfalls
What commonly goes wrong when building this? List at least 5 specific pitfalls and how to avoid them.

## Interactive Requirements
How does user input work? (keyboard, mouse, touch) What events are needed?

## Implementation Order
Step-by-step order to build this correctly so nothing is left undefined or broken.

Be specific, technical, and concise. No code yet.`;

  const architectResponse = await architectModel.invoke(architectPrompt);
  const architectPlan = architectResponse.content;
  console.log("[debate] Round 1 complete — Architect plan ready");

  // ── Round 2: Critic ────────────────────────────────────────────────────────
  console.log("[debate] Round 2 — Critic reviewing plan...");

  const criticPrompt = `You are a senior code reviewer and critic.

A software architect proposed this plan to build: "${userPrompt}"

=== ARCHITECT'S PLAN ===
${architectPlan}
========================

Your job: Critically review this plan and improve it.

Respond with:

## What's Good
2-3 things the plan gets right.

## Problems & Gaps
Specific issues — missing logic, wrong approach, undefined behavior, performance problems, interaction bugs.

## Improvements
For each problem above, give a concrete fix or better approach.

## Refined Implementation Notes
A final summary of the improved plan that the coder should follow. Be exhaustive — the coder will only read this section.

Be direct, specific, and technical.`;

  const criticResponse = await criticModel.invoke(criticPrompt);
  const criticFeedback = criticResponse.content;
  console.log("[debate] Round 2 complete — Critic review ready");

  // ── Round 3: Coder ─────────────────────────────────────────────────────────
  console.log("[debate] Round 3 — Coder generating final code...");

  const coderPrompt = `You are an expert software engineer outputting RAW CODE ONLY.

ABSOLUTE RULES — NEVER VIOLATE:
1. Output ZERO prose, ZERO explanation, ZERO markdown text
2. Do NOT write "Here is the code", "Here's the implementation", or any sentence
3. Do NOT add any text before the first FILE: marker
4. Do NOT add any text after the last line of code
5. Every file's content must be PURE CODE — no comments explaining what you did
6. Start your response with "FILE:" immediately — nothing before it

The user wants: "${userPrompt}"

Two senior engineers have reviewed and refined the plan for you:

=== ARCHITECT'S PLAN ===
${architectPlan}
========================

=== CRITIC'S IMPROVEMENTS ===
${criticFeedback}
=============================

Using this refined plan as your blueprint, generate the complete, fully working code.

${outputFormat}`;

  const coderResponse = await coderModel.invoke(coderPrompt);
  console.log("[debate] Round 3 complete — Final code generated");

  return {
    architectPlan,
    criticFeedback,
    finalCode: coderResponse.content,
  };
}
