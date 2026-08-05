import { checkAgentLimit } from "../config/agentRateLimit.js";
import { deductCredits }   from "../utils/deductCredits.js";
import { getModel }        from "../utils/model.js";

// ─── Content Extraction ───────────────────────────────────────────────────────
// Strips markdown prose LLMs add before/after code blocks in FILE: sections.

function extractFileContent(raw = "", filename = "") {
  let code = raw
    .replace(/```[\w.-]*\n?/g, "")
    .replace(/```/g, "")
    .trim();

  const ext = filename.split(".").pop()?.toLowerCase();

  if (ext === "html") {
    const start = code.search(/<(!DOCTYPE|html|head|body)/i);
    if (start > 0) code = code.slice(start);
    const end = code.lastIndexOf("</html>");
    if (end !== -1) code = code.slice(0, end + 7);
  } else if (ext === "css") {
    const start = code.search(/^([*]|:|@|[.#a-zA-Z])/m);
    if (start > 0) code = code.slice(start);
  } else if (["js", "ts", "jsx", "tsx", "mjs"].includes(ext)) {
    const start = code.search(/^(var |let |const |function |class |import |export |\/\/|\/\*|\(|async |await )/m);
    if (start > 0) code = code.slice(start);
  } else if (["py", "rb", "go", "rs", "java", "kt", "swift"].includes(ext)) {
    // Strip prose lines at top for server-side languages
    const lines = code.split("\n");
    const codeStart = lines.findIndex(l =>
      /^(import |from |def |class |#|\/\/|package |use |pub |fn |func |@|if |for |while |const |let |var |async )/.test(l.trim())
    );
    if (codeStart > 0) code = lines.slice(codeStart).join("\n");
  }

  return code.trim();
}

// ─── Agent ────────────────────────────────────────────────────────────────────

export const codingAgent = async (state) => {

  await checkAgentLimit(state.userId, "coding");

  let useFreeMode = false;
  try {
    await deductCredits(state.userId, "coding");
  } catch (creditErr) {
    if (creditErr.status === 402 || creditErr.data?.title === "Insufficient Credits") {
      console.warn("[coding-agent] Insufficient credits — switching to free Groq mode");
      useFreeMode = true;
    } else {
      throw creditErr;
    }
  }

  const llm = getModel("coding");

  const response = await llm.invoke(`You are CortexAI — an elite full-stack AI engineer.
You generate production-quality code in ANY language or framework, including full-stack projects.

══════════════════════════════════════
INTENT DETECTION
══════════════════════════════════════

First classify the request:

CODE_GENERATION  → user wants you to build something
CODE_REVIEW      → user shares code and asks for feedback
CODE_EXPLANATION → user wants code explained
DEBUGGING        → user asks to fix a bug
OPTIMIZATION     → user asks to improve performance

For CODE_REVIEW / CODE_EXPLANATION / DEBUGGING / OPTIMIZATION:
Return Markdown ONLY. Do NOT generate project files.
Structure: # Overview | ## Issues | ## Fixes | ## Improved Code

══════════════════════════════════════
TECH STACK DETECTION (CODE_GENERATION)
══════════════════════════════════════

Detect the best stack from the user's request:

| User says                      | Stack                                          |
|-------------------------------|------------------------------------------------|
| "HTML / CSS / JS / website"   | Vanilla HTML + CSS + JS (3 files)              |
| "React app / component"       | React (Vite) — src/App.jsx, src/main.jsx, etc. |
| "Next.js"                     | Next.js 14 app router structure                |
| "Vue / Angular / Svelte"      | That framework's project structure             |
| "Node.js / Express API"       | Node.js + Express — index.js, routes/, etc.    |
| "Python / Flask / FastAPI"    | Python — app.py / main.py + requirements.txt  |
| "Django"                      | Django project structure                       |
| "full-stack"                  | Frontend folder + backend folder               |
| "game / canvas / animation"   | Single self-contained index.html               |
| "CLI / script"                | Single file in the appropriate language        |
| No framework mentioned        | Vanilla HTML + CSS + JS                        |

══════════════════════════════════════
FILE STRUCTURE RULES
══════════════════════════════════════

Use nested paths when needed:

FILE: package.json
FILE: src/App.jsx
FILE: src/components/Navbar.jsx
FILE: src/pages/Home.jsx
FILE: backend/index.js
FILE: backend/routes/api.js
FILE: requirements.txt
FILE: app.py

RULES:
- Always include a package.json (with scripts) for Node/React/Next projects
- Always include requirements.txt for Python projects
- Always include README.md for full-stack projects
- For React/Next: include all necessary config files (vite.config.js, tailwind.config.js, etc.)
- For backend APIs: include working routes, middleware, and error handling
- NEVER generate placeholder functions — every function must be fully implemented

══════════════════════════════════════
DESIGN & UI MANDATE (frontend projects)
══════════════════════════════════════

- Dark theme by default: background #090d16 / #0f1117
- Accent gradients: linear-gradient(135deg, #6366f1, #8b5cf6)
- Typography: @import Inter from Google Fonts, apply globally
- Glassmorphism cards: background rgba(255,255,255,0.03); backdrop-filter blur(16px); border 1px solid rgba(255,255,255,0.08)
- CSS variables for all design tokens
- Smooth transitions: cubic-bezier(0.4, 0, 0.2, 1) 0.3s
- Responsive: mobile-first, flexbox/grid layouts
- Real Unsplash images (never placeholder)
- Every UI project must look like a $100,000 product

══════════════════════════════════════
SECTION MAPPING (websites)
══════════════════════════════════════

NEVER use generic Home/About/Services sections.
Match sections to EXACTLY what the user asked for:

- e-commerce   → Hero, Product Grid, Cart Sidebar, Filters, Product Modal, Checkout CTA, Footer
- portfolio    → Hero, About, Skills, Projects Grid, Testimonials, Contact Form, Footer
- dashboard    → Sidebar Nav, KPI Cards, Charts, Data Tables, Recent Activity Feed
- SaaS landing → Hero, Features, How It Works, Pricing Cards, FAQ Accordion, CTA, Footer
- blog         → Featured Post, Post Grid, Categories Sidebar, Newsletter, Footer
- restaurant   → Hero, Menu Tabs, Gallery Masonry, Reservations Form, Location Map, Footer
- Other        → Derive the most logical domain-specific sections

══════════════════════════════════════
JAVASCRIPT — DYNAMIC BEHAVIOUR
══════════════════════════════════════

For ALL vanilla HTML/JS projects:
- Wrap ALL JS in DOMContentLoaded
- Manage state as a single state object: let state = { ... }
- Working event listeners on EVERY interactive element
- Real functionality: working cart, filters, modals, form validation
- Dynamic DOM rendering from data arrays (no static placeholder text)
- Micro-animations on all interactions

For GAMES:
- Single FILE: index.html with inline <style> and <script>
- Complete game logic: collision, scoring, lives, win/lose
- requestAnimationFrame render loop
- Start rendering canvas IMMEDIATELY — never wait for keypress
- Keyboard listeners on BOTH document AND canvas
- call canvas.focus() on load

For React/Next:
- useState + useEffect for all state
- Proper component decomposition
- Working API calls (use mock data if no backend)

For Node/Express/FastAPI:
- Proper middleware setup (cors, json parsing, error handling)
- Working route handlers with real logic
- Environment variable config (.env.example)

══════════════════════════════════════
OUTPUT FORMAT
══════════════════════════════════════

For CODE_GENERATION — output ONLY this format, nothing else:

FILE: path/to/filename.ext
[complete file content here]

FILE: path/to/another/file.ext
[complete file content here]

RULES:
- Start your response with "FILE:" — no introduction, no explanation
- NEVER truncate — generate 100% complete, working code
- No markdown, no backticks around FILE blocks, no commentary
- Every file must be complete and functional on its own

User Request:

${state.prompt}`);

  // ── Parse response ──────────────────────────────────────────────────────────
  const rawContent = response.content || "";

  // Free mode override: re-generate with Groq
  let finalContent = rawContent;
  if (useFreeMode && (rawContent.includes("FILE:") || /<!DOCTYPE|<html/i.test(rawContent))) {
    console.log("[coding-agent] Free mode — re-generating with Groq");
    const groq = getModel("chat");
    const groqRes = await groq.invoke(
      `You are an expert coder. Generate complete working code for: "${state.prompt}"\n\nOutput format — start with FILE: immediately:\nFILE: filename.ext\n[code]\n\nNo explanation, no markdown.`
    );
    finalContent = groqRes.content || rawContent;
  }

  const content = finalContent.trim();

  // ── Detect if this is a code response or a chat response ───────────────────
  const hasFileMarkers = content.includes("FILE:");
  const isRawHtml      = /^<!DOCTYPE|^<html/i.test(content);

  if (!hasFileMarkers && !isRawHtml) {
    // Chat-style response (review, explanation, debug)
    return { ...state, response: content, artifacts: [] };
  }

  // ── Extract files ───────────────────────────────────────────────────────────
  const files = [];

  if (isRawHtml && !hasFileMarkers) {
    files.push({ name: "index.html", content: extractFileContent(content, "index.html") });
  } else {
    const matches = [
      ...content.matchAll(/FILE:\s*([^\n]+)\n([\s\S]*?)(?=\nFILE:\s*[^\n]+\n|$)/g)
    ];

    matches.forEach(match => {
      const rawName = match[1].trim().replace(/[*`_]/g, "").trim();
      if (!rawName) return;
      files.push({
        name:    rawName,
        content: extractFileContent(match[2], rawName),
      });
    });
  }

  if (!files.length) {
    return { ...state, response: content, artifacts: [] };
  }

  // ── Detect project type for frontend display ────────────────────────────────
  const hasHtml    = files.some(f => f.name.endsWith(".html"));
  const hasReact   = files.some(f => f.name.match(/\.(jsx|tsx)$/));
  const hasPython  = files.some(f => f.name.endsWith(".py"));
  const hasNode    = files.some(f => f.name === "package.json");
  const isFullStack = files.some(f => f.name.startsWith("backend/") || f.name.startsWith("server/") || f.name.startsWith("api/"));

  let projectType = "html";
  if (isFullStack)   projectType = "fullstack";
  else if (hasReact) projectType = "react";
  else if (hasPython) projectType = "python";
  else if (hasNode && !hasHtml) projectType = "node";

  return {
    ...state,
    response: "Code generated successfully.",
    artifacts: [{
      id:          Date.now(),
      type:        "project",
      projectType,
      title:       state.prompt,
      files,
      createdAt:   new Date().toISOString(),
    }],
  };
};