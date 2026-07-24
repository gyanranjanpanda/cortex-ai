import { ChatGoogleGenerativeAI }
  from "@langchain/google-genai";
import { ChatGroq } from "@langchain/groq"
import dotenv from "dotenv"
dotenv.config()
import { ChatOpenRouter } from "@langchain/openrouter";

// DeepSeek via OpenRouter — best coding model, handles long game/app code
const deepseek = new ChatOpenRouter({
  model: "deepseek/deepseek-chat",
  temperature: 0,
  maxTokens: 8192,
});


export const gemini =
  new ChatGoogleGenerativeAI({
    model: "gemini-2.5-flash",
    apiKey: process.env.GOOGLE_API_KEY || "placeholder_key",
    maxOutputTokens: 8192,
  });



// Groq/LLaMA — fast model for quick tasks (search, chat, image prompts)
const groq = new ChatGroq({
  model: "llama-3.3-70b-versatile",
  temperature: 0,
  maxTokens: 4096,
  maxRetries: 2,
})


export const getModel =
  (agent) => {

    switch (agent) {

      case "coding":
        // Gemini 2.5 Flash — free (1500 req/day), excellent at code generation
        return gemini;


      case "image":
        return groq;

      case "search":
        return groq;

      case "chat":
        return groq;
      case "vision":
        return gemini;
      default:
        return groq;

    }

  }