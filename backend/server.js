import express from 'express';
import cors from 'cors';
import multer from 'multer';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:4173', 'http://127.0.0.1:5173'],
  methods: ['GET', 'POST'],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// Allowed video extensions and MIME types
const ALLOWED_EXTENSIONS = /\.(mp4|webm|avi|mov|mkv)$/i;
const ALLOWED_MIMETYPES = [
  'video/mp4',
  'video/webm',
  'video/x-msvideo',
  'video/quicktime',
  'video/x-matroska',
  'video/avi',
  'video/msvideo'
];

const upload = multer({
  storage: storage,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2GB limit
  fileFilter: (req, file, cb) => {
    const extValid = ALLOWED_EXTENSIONS.test(path.extname(file.originalname).toLowerCase());
    const mimeValid = ALLOWED_MIMETYPES.includes(file.mimetype) || file.mimetype.startsWith('video/');

    if (extValid && mimeValid) {
      return cb(null, true);
    } else {
      cb(new Error('Only video files (mp4, webm, avi, mov, mkv) are allowed.'));
    }
  }
});

// JSON Schema for Gemini structured output
const responseSchema = {
  type: "OBJECT",
  properties: {
    english: {
      type: "OBJECT",
      properties: {
        summary: { 
          type: "STRING", 
          description: "An extremely detailed, comprehensive summary of the video (at least 2-3 long paragraphs, 150-250 words) detailing everything discussed, the core context, the speaker's arguments, and conclusions." 
        },
        keyPoints: {
          type: "ARRAY",
          items: { type: "STRING" },
          description: "A list of 8-12 comprehensive key highlights and detailed insights from the video."
        },
        notes: {
          type: "ARRAY",
          items: { type: "STRING" },
          description: "Extremely detailed, exhaustive step-by-step structured study notes covering every single point, argument, topic, formula, tool, or code block mentioned in the video in high detail with temporal context/timestamps."
        }
      },
      required: ["summary", "keyPoints", "notes"]
    },
    hinglish: {
      type: "OBJECT",
      properties: {
        summary: { 
          type: "STRING", 
          description: "Ek lamba aur detail mein likha hua natural Hinglish (Latin script Hindi) summary (kam se kam 2-3 bade paragraphs, 150-250 words) jo video ki har ek baat aur mudde ko achhe se cover kare." 
        },
        keyPoints: {
          type: "ARRAY",
          items: { type: "STRING" },
          description: "Video ki 8-12 sabse jaruri aur khaas baatein details ke sath (Hinglish mein)."
        },
        notes: {
          type: "ARRAY",
          items: { type: "STRING" },
          description: "Ekdum detailed, point-by-point exhaustive study notes Hinglish mein, jo video ki har ek topic, timestamps, and details ko thoroughly cover karein (koi bhi point chhootna nahi chahiye)."
        }
      },
      required: ["summary", "keyPoints", "notes"]
    }
  },
  required: ["english", "hinglish"]
};

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'VidNotes Backend is running',
    hasApiKey: !!process.env.GEMINI_API_KEY 
  });
});

// Helper: safely extract text from Gemini response
function extractResponseText(response) {
  if (!response) return null;
  // Handle both property and method style
  if (typeof response.text === 'function') {
    return response.text();
  }
  if (typeof response.text === 'string') {
    return response.text;
  }
  // Fallback: try candidates
  if (response.candidates && response.candidates[0]) {
    const parts = response.candidates[0].content?.parts;
    if (parts && parts[0] && parts[0].text) {
      return parts[0].text;
    }
  }
  return null;
}

// Route: Upload & Summarize Video
app.post('/api/summarize', upload.single('video'), async (req, res) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: 'No video file uploaded.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    // Clean up local file first
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    return res.status(500).json({ 
      error: 'Gemini API Key is not configured on the server. Please add GEMINI_API_KEY to your .env file.' 
    });
  }

  console.log(`Received file: ${file.originalname} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`);

  try {
    // Initialize Google Gen AI client
    const ai = new GoogleGenAI({ apiKey });

    console.log("Uploading file to Google Gemini File API...");
    let uploadResult = await ai.files.upload({
      file: file.path,
      config: {
        mimeType: file.mimetype,
      }
    });

    console.log(`File uploaded. Name: ${uploadResult.name}`);

    // Wait for the video to be processed (status ACTIVE)
    let isProcessed = false;
    let attempts = 0;
    const maxAttempts = 180; // 15 minutes max (5s interval)

    while (!isProcessed && attempts < maxAttempts) {
      attempts++;
      console.log(`Polling video status (Attempt ${attempts}/${maxAttempts})...`);
      
      const fileStatus = await ai.files.get({ name: uploadResult.name });
      console.log(`Status: ${fileStatus.state}`);

      if (fileStatus.state === 'ACTIVE') {
        isProcessed = true;
        uploadResult = fileStatus; // Update metadata with final active file
      } else if (fileStatus.state === 'FAILED') {
        throw new Error('Google Gemini Video Ingestion failed.');
      } else {
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    if (!isProcessed) {
      throw new Error('Video ingestion timed out. Please try with a smaller or shorter video.');
    }

    console.log("Video processing complete. Ingesting content with Gemini...");

    // Send generation request to Gemini
    const prompt = `
      You are an elite research assistant. Analyze the uploaded video file in extreme detail.
      Your output must be highly detailed, exhaustive, and comprehensive. Do NOT give high-level, short summaries or brief bullet points.
      
      Generate:
      1. An exhaustive Summary of the video content covering all chapters/topics discussed, context, problems raised, and solutions offered. Write at least 2-3 long, descriptive paragraphs (150-250 words) for the summary.
      2. A list of 8-12 detailed Key Highlights, detailing not just what was said but why it is important.
      3. A large set of extremely comprehensive step-by-step Structured Study Notes. Transcribe and summarize every single subtopic, concept, step, code, formula, advice, or fact mentioned in the video, with temporal reference/timestamps. Ensure absolutely no important details are omitted.
      
      Provide all of these in BOTH English and Hinglish as requested by the JSON schema.
      Ensure the Hinglish translation is natural, flowing, and highly descriptive (Latin script Hindi used in common messaging).
    `;

    // Use actually existing Gemini model names (most reliable first)
    const candidateModels = [
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-1.5-flash',
      'gemini-1.5-pro'
    ];

    let response = null;
    let finalModelUsed = null;
    let lastError = null;

    for (const modelName of candidateModels) {
      try {
        console.log(`Attempting generation with model: ${modelName}...`);
        response = await ai.models.generateContent({
          model: modelName,
          contents: [
            {
              role: 'user',
              parts: [
                {
                  fileData: {
                    fileUri: uploadResult.uri,
                    mimeType: uploadResult.mimeType
                  }
                },
                { text: prompt }
              ]
            }
          ],
          config: {
            responseMimeType: 'application/json',
            responseSchema: responseSchema
          }
        });
        finalModelUsed = modelName;
        console.log(`AI Generation successful with model: ${modelName}!`);
        break; // Stop loop on success
      } catch (err) {
        console.warn(`Model ${modelName} failed: ${err.message}`);
        lastError = err;
      }
    }

    if (!response) {
      throw new Error(`All Gemini models failed. Last error: ${lastError ? lastError.message : 'Unknown error'}`);
    }

    // Clean up Gemini File API storage (important to prevent quota leaks)
    try {
      await ai.files.delete({ name: uploadResult.name });
      console.log("Cleaned up Gemini cloud file storage.");
    } catch (cleanupErr) {
      console.warn("Could not clean up Gemini cloud file:", cleanupErr.message);
    }

    // Clean up local temp file
    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
      console.log("Cleaned up local temporary video file.");
    }

    // Safely extract and parse JSON response
    const responseText = extractResponseText(response);
    if (!responseText) {
      throw new Error('No response text received from Gemini. The model may have returned an empty response.');
    }

    let parsedData;
    try {
      parsedData = JSON.parse(responseText);
    } catch (parseErr) {
      console.error("JSON Parse Error. Raw response:", responseText.substring(0, 500));
      throw new Error('Failed to parse Gemini response as JSON. The model returned an unexpected format.');
    }

    // Validate the parsed data has the expected structure
    if (!parsedData.english || !parsedData.hinglish) {
      throw new Error('Gemini response is missing required fields (english/hinglish). Please try again.');
    }

    return res.json({
      success: true,
      videoName: file.originalname,
      modelUsed: finalModelUsed,
      results: parsedData
    });

  } catch (error) {
    console.error("Error processing video:", error);

    // Clean up local file on failure
    if (file && fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }

    return res.status(500).json({ 
      error: error.message || 'An error occurred during video analysis.' 
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Global Error Handler:", err);
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Upload failed: File is too large. Max limit is 2GB.' });
    }
    return res.status(400).json({ error: `Upload failed: ${err.message}` });
  }
  return res.status(500).json({ error: err.message || 'An internal server error occurred.' });
});

// Start Server
const server = app.listen(PORT, () => {
  console.log(`VidNotes Server is running on http://localhost:${PORT}`);
});

// Set high timeouts for large file processing/uploads (30 minutes)
server.timeout = 30 * 60 * 1000;
server.keepAliveTimeout = 30 * 60 * 1000;
server.headersTimeout = 31 * 60 * 1000;
