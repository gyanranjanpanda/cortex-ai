import { gemini, getModel } from "./model.js";

/**
 * Multi-agent debate pipeline for code generation.
 *
 * Round 1 — Architect (Gemini): Plans the solution structure, components,
 *            algorithms, and known edge cases.
 *
 * Round 2 — Critic (Groq): Reviews the plan. Points out gaps, bugs,
 *            performance issues, and proposes improvements.
 *
 * Round 3 — Coder (Gemini): Generates the final code using the refined
 *            plan as its blueprint.
 *
 * This produces significantly better code than a single-model approach
 * because design decisions are validated before a line of code is written.
 */
export async function debateAndCode(userPrompt, outputFormat) {
  const groq = getModel("chat");

  console.log("[debate] Round 1 — Architect planning...");

  // ── Round 1: Architect ─────────────────────────────────────────────────────
  const architectPrompt = `You are a senior software architect.

The user wants to build: "${userPrompt}"

Your job is NOT to write code yet. Your job is to produce a clear, detailed PLAN.

Respond with:

## Intent
What exactly are we building?

## Tech Stack
Which HTML/CSS/JS APIs, Canvas methods, or libraries will be used? Why?

## Components
List every major component (e.g. game loop, collision system, renderer, state machine).

## Algorithms & Data Structures
Describe the core logic (e.g. maze generation, pathfinding, physics).

## Edge Cases & Pitfalls
What commonly goes wrong when building this? List at least 5 specific pitfalls and how to avoid them.

## Implementation Order
Step-by-step order to build this correctly so nothing is left undefined.

Be specific, technical, and concise. No code yet.`;

  const architectResponse = await gemini.invoke(architectPrompt);
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
Specific issues — missing logic, wrong approach, undefined behavior, performance problems.

## Improvements
For each problem above, give a concrete fix or better approach.

## Refined Implementation Notes
A final summary of the improved plan that the coder should follow.

Be direct, specific, and technical.`;

  const criticResponse = await groq.invoke(criticPrompt);
  const criticFeedback = criticResponse.content;
  console.log("[debate] Round 2 complete — Critic review ready");

  // ── Round 3: Coder ─────────────────────────────────────────────────────────
  console.log("[debate] Round 3 — Coder generating final code...");

  const coderPrompt = `You are an expert software engineer.

The user wants: "${userPrompt}"

Two senior engineers have reviewed and planned this for you:

=== ARCHITECT'S PLAN ===
${architectPlan}
========================

=== CRITIC'S IMPROVEMENTS ===
${criticFeedback}
=============================

Using this refined plan, generate the complete, fully working code.

${outputFormat}`;

  const coderResponse = await gemini.invoke(coderPrompt);
  console.log("[debate] Round 3 complete — Final code generated");

  return {
    architectPlan,
    criticFeedback,
    finalCode: coderResponse.content,
  };
}
