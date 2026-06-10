import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
console.log("Using API Key:", apiKey ? apiKey.substring(0, 10) + "..." : "undefined");

const ai = new GoogleGenAI({ apiKey });

async function main() {
  try {
    const list = await ai.models.list();
    console.log("Gemini Models in pageInternal:");
    if (list.pageInternal && Array.isArray(list.pageInternal)) {
      list.pageInternal.forEach(m => {
        console.log(`- ${m.name}`);
      });
    }
  } catch (err) {
    console.error("Error listing models:", err.message);
  }
}

main();
