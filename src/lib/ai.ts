import { GoogleGenAI, Type, Modality } from "@google/genai";
import { ExtractionResult, Category, ModelProvider } from "../types";
import { validateData } from "./validation";
import { generateEmailId } from "./utils";
import { sanitizeInput } from "./security";

const apiKey = process.env.GEMINI_API_KEY!;
const ai = new GoogleGenAI({ apiKey });

const EXTRACTION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING, description: "The name of the entity or sender" },
    date: { type: Type.STRING, description: "The date of the transaction (YYYY-MM-DD)" },
    amount: { type: Type.NUMBER, description: "The numeric amount of the transaction" },
    category: { 
      type: Type.STRING, 
      description: "The category: invoice, payment, refund, or other",
      enum: ["invoice", "payment", "refund", "other"]
    },
  },
  required: ["name", "date", "amount", "category"],
};

export async function extractFromEmail(
  emailText: string, 
  customInstructions?: string,
  provider: ModelProvider = "gemini"
): Promise<ExtractionResult> {
  const sanitizedText = sanitizeInput(emailText);
  const sanitizedInstructions = sanitizeInput(customInstructions || "");

  try {
    let rawData: any = {};

    if (provider === "gemini") {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Extract the following details from this input:
        
        ${sanitizedText}
        
        Rules:
        - Return valid JSON only.
        - Use category 'other' if unsure.
        - Use today's date if missing.
        - Normalize names to Title Case.
        ${sanitizedInstructions ? `\nAdditional Instructions:\n${sanitizedInstructions}` : ""}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: EXTRACTION_SCHEMA,
          tools: [{ googleSearch: {} }],
        },
      });
      rawData = JSON.parse(response.text || "{}");
    } else if (provider === "ollama") {
      // Mocking Ollama call - in a real app, this would be a fetch to localhost:11434
      console.log("Ollama provider selected. Mocking response...");
      rawData = { name: "Ollama Mock", date: "2026-04-06", amount: 100, category: "other" };
    } else if (provider === "claude") {
      // Mocking Claude call
      console.log("Claude provider selected. Mocking response...");
      rawData = { name: "Claude Mock", date: "2026-04-06", amount: 200, category: "invoice" };
    }

    const { coerced } = validateData(rawData);
    coerced.email_id = generateEmailId(coerced.name, coerced.date, coerced.amount);
    coerced.source_type = "text";
    
    return coerced;
  } catch (error) {
    console.error("AI Extraction Error:", error);
    const { coerced } = validateData({});
    coerced.email_id = "ERROR-" + Math.random().toString(36).substr(2, 9);
    coerced.status = "error";
    coerced.validation_errors = [`AI extraction failed: ${error instanceof Error ? error.message : "Unknown error"}`];
    coerced.fallback_reason = "AI parsing failed, using default values";
    coerced.source_type = "text";
    return coerced;
  }
}

export async function analyzeInvoiceImage(
  base64Image: string, 
  mimeType: string, 
  customInstructions?: string,
  provider: ModelProvider = "gemini"
): Promise<ExtractionResult> {
  const sanitizedInstructions = sanitizeInput(customInstructions || "");

  try {
    let rawData: any = {};

    if (provider === "gemini") {
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: {
          parts: [
            { inlineData: { data: base64Image, mimeType } },
            { text: `Analyze this invoice or receipt image and extract the details in JSON format.
            ${sanitizedInstructions ? `\nAdditional Instructions:\n${sanitizedInstructions}` : ""}` }
          ]
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: EXTRACTION_SCHEMA,
        },
      });
      rawData = JSON.parse(response.text || "{}");
    } else {
      // Vision models are typically only available via cloud APIs like Gemini/Claude
      console.log(`${provider} vision not implemented. Falling back to Gemini.`);
      return analyzeInvoiceImage(base64Image, mimeType, customInstructions, "gemini");
    }

    const { coerced } = validateData(rawData);
    coerced.email_id = generateEmailId(coerced.name, coerced.date, coerced.amount);
    coerced.source_type = "image";
    
    return coerced;
  } catch (error) {
    console.error("Image Analysis Error:", error);
    const { coerced } = validateData({});
    coerced.email_id = "ERROR-" + Math.random().toString(36).substr(2, 9);
    coerced.status = "error";
    coerced.validation_errors = [`Image analysis failed: ${error instanceof Error ? error.message : "Unknown error"}`];
    coerced.fallback_reason = "AI parsing failed, using default values";
    coerced.source_type = "image";
    return coerced;
  }
}

export async function speakSummary(text: string) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `Say clearly: ${text}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: "Kore" },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
      // Decode base64 to raw PCM (16-bit, 24kHz)
      const binaryString = atob(base64Audio);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Convert to Float32 for Web Audio API
      const int16Buffer = new Int16Array(bytes.buffer);
      const float32Buffer = new Float32Array(int16Buffer.length);
      for (let i = 0; i < int16Buffer.length; i++) {
        float32Buffer[i] = int16Buffer[i] / 32768.0;
      }

      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      const audioBuffer = audioCtx.createBuffer(1, float32Buffer.length, 24000);
      audioBuffer.getChannelData(0).set(float32Buffer);

      const source = audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioCtx.destination);
      source.start();
    }
  } catch (error) {
    console.error("TTS Error:", error);
  }
}
