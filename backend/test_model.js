import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey });

const candidateModels = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash'
];

async function main() {
  for (const model of candidateModels) {
    try {
      console.log(`Testing model: ${model}...`);
      const response = await ai.models.generateContent({
        model: model,
        contents: 'Say Hello World in 3 words'
      });
      console.log(`Success with ${model}! Response: ${response.text.trim()}`);
    } catch (err) {
      console.error(`Failed for ${model}: ${err.message}`);
    }
    console.log("-----------------------------------");
  }
}

main();
