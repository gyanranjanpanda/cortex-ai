import { GoogleGenerativeAIEmbeddings }
from "@langchain/google-genai";

export const embeddings =
new GoogleGenerativeAIEmbeddings({

    apiKey:
    process.env.GOOGLE_API_KEY || "placeholder_key",


    model:
    "gemini-embedding-001"

});