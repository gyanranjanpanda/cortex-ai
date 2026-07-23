import { checkAgentLimit } from "../config/agentRateLimit.js";
import { deductCredits } from "../utils/deductCredits.js";
import { getModel } from "../utils/model.js";

export const codingAgent = async (state) => {

await checkAgentLimit(
    state.userId,
    "coding"
  );
 await deductCredits(

        state.userId,

        "coding"

    );

function cleanCode(code = "") {
  return code
    .replace(/```[\w-]*\n?/g, "")
    .replace(/```/g, "")
    .trim();
}

  const llm =
    getModel("coding");

 const response = await llm.invoke(`You are CortexAI Coding Agent.

Your first task is to identify the user's intent.

=========================
INTENT DETECTION
=========================

Classify the request into ONE of these:

1. CODE_GENERATION
2. CODE_REVIEW
3. CODE_EXPLANATION
4. DEBUGGING
5. OPTIMIZATION
6. CONVERSION
7. DOCUMENTATION

=========================
CODE REVIEW
=========================

If the user provides code and asks:

- review
- explain
- optimize
- debug
- find bugs
- improve
- refactor

DO NOT generate a new project.

Instead return Markdown only.

Include:

# Overview

## What this code does

## Problems

## Improvements

## Best Practices

## Optimized snippets (if required)

For explanations:

- Never wrap variable names in triple backticks.
- Use single backticks only for inline code.
- Use triple backticks ONLY for complete code blocks.


=========================
CODE GENERATION
=========================

Default stack:

HTML
CSS
JavaScript

Do NOT use any framework unless explicitly requested.

Examples:

"Build portfolio"
→ HTML CSS JS

"Create ecommerce"
→ HTML CSS JS

"Create dashboard"
→ HTML CSS JS

"React dashboard"
→ React

"Next.js blog"
→ Next.js

=========================
WEBSITE RULE
=========================

Unless the user explicitly requests multiple pages,

ALWAYS build a SINGLE PAGE website.

Use sections:

Home
About
Services
Features
Pricing
Testimonials
Contact
Footer

Navigation should smoothly scroll.

Do NOT generate:

about.html
contact.html
pricing.html

unless the user explicitly asks.

=========================
PROJECT FILES
=========================

For default websites generate only:

FILE: index.html

FILE: style.css

FILE: script.js

Generate extra files ONLY if necessary.

=========================
DESIGN & UI EXCELLENCE MANDATE
=========================

- Create stunning, high-end, visual WOW-factor interfaces.
- USE DARK THEME BY DEFAULT with sleek dark background (#090d16 / #111827) and curated neon/pastel accent gradients (e.g. linear-gradient(135deg, #6366f1, #8b5cf6)).
- ALWAYS IMPORT modern typography: `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700;800&display=swap');` and apply `font-family: 'Inter', sans-serif;`.
- Use Glassmorphism: `background: rgba(255, 255, 255, 0.03); backdrop-filter: blur(16px); border: 1px solid rgba(255, 255, 255, 0.08); shadow: 0 10px 30px rgba(0,0,0,0.5);`.
- Use rich CSS variables for colors, spacing, and border-radii.
- Add interactive hover effects, smooth transitions (`transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1)`), and dynamic canvas/UI layout.
- Spacing must be generous (padding: 2rem+), responsive, and look like a $100,000 product dashboard/website.

=========================
IMAGES
=========================

Always use real Unsplash images.

Never use placeholders.

=========================
JAVASCRIPT
=========================

Keep JS minimal.

Only interactive logic.

No unnecessary functions.

=========================
OUTPUT
=========================

If intent is CODE_GENERATION

Return ONLY:

FILE: index.html

...

FILE: style.css

...

FILE: script.js

...

No markdown.

No explanation.

If intent is REVIEW / EXPLAIN / DEBUG

Return Markdown only.

Do NOT generate project files.

=========================
TOKEN BUDGET
=========================

Maximum ~2000 output tokens.

Prefer concise but beautiful code.

Generate only what is required.

User Request:

${state.prompt}`);

  const content =
    response.content?.trim();
console.log(content)
  const files = [];

  const matches = [
    ...content.matchAll(
      /FILE:\s*([^\n]+)\n([\s\S]*?)(?=\nFILE:\s*[^\n]+\n|$)/g
    )
  ];

  if(matches.length){

    matches.forEach(match => {

      files.push({
  name: match[1].trim(),
  content: cleanCode(match[2]),
});

    });

  }else{

    let fileName = "main.js";

    const prompt =
      state.prompt.toLowerCase();

    if(prompt.includes("html")){
      fileName = "index.html";
    }
    else if(prompt.includes("css")){
      fileName = "style.css";
    }
    else if(prompt.includes("python")){
      fileName = "main.py";
    }
    else if(prompt.includes("java")){
      fileName = "Main.java";
    }
    else if(prompt.includes("c++")){
      fileName = "main.cpp";
    }

   

 

  }


  if (!content.includes("FILE:")) {
  return {
    ...state,
    response: content,
    artifacts: []
  };
}

  return {

    ...state,

    response:
      "Code generated successfully.",

    artifacts:[
      {
        id:Date.now(),
        type:"project",
        title:state.prompt,
        files,
        createdAt:
          new Date().toISOString()
      }
    ]

  };

};