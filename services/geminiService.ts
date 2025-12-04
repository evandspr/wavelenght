
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { SpectrumCard } from '../types';

// Initialize Gemini Client
const apiKey = import.meta.env.VITE_API_KEY;
if (!apiKey) {
  console.error("Missing VITE_API_KEY in environment variables");
}
const ai = new GoogleGenAI({ apiKey: apiKey || 'dummy_key' });

const cardSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    left: { type: Type.STRING, description: "The concept on the left side of the spectrum (0%)" },
    right: { type: Type.STRING, description: "The concept on the right side of the spectrum (100%)" },
  },
  required: ["left", "right"],
};

/**
 * Generates a random binary opposition card for the game using Gemini.
 */
export const generateCard = async (): Promise<SpectrumCard> => {
  try {
    const prompt = `
      Generate a creative, subjective binary opposition pair for the game Wavelength.
      Examples: 'Underrated - Overrated', 'Rough - Smooth', 'Better hot - Better cold', 'Forgivable - Unforgivable'.
      Avoid purely objective measurements like 'Short - Tall'.
      Be creative and varied.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: cardSchema,
        temperature: 1.0, // High creativity
      },
    });
    
    if (response.text) {
      return JSON.parse(response.text) as SpectrumCard;
    }
    throw new Error("No text returned");
  } catch (error) {
    console.error("Gemini Card Generation Error:", error);
    // Fallback to random predefined card if API fails
    const fallbacks = [
       { left: "Bad Movie", right: "Good Movie" },
       { left: "Useless", right: "Useful" },
       { left: "Trash", right: "Treasure" },
       { left: "Happens slowly", right: "Happens suddenly" },
       { left: "Job you want", right: "Job you don't want" }
    ];
    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }
};
