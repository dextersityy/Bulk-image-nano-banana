// FIX: Added ambient declarations for JSZip and saveAs to resolve TypeScript errors.
// These variables are available globally from CDN scripts.
declare var JSZip: any;
declare var saveAs: any;

import { GoogleGenAI } from "@google/genai";
import { GenerationResult, HistoryItem } from '../types';

const HISTORY_KEY = 'gemini-image-generator-history';

/**
 * Checks if an error object indicates a rate limit error from the API.
 */
function isRateLimitError(error: any): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return message.includes('quota') || message.includes('rate limit');
  }
  return false;
}

/**
 * Generates a set of images for a single prompt using a specific API key.
 * This has been optimized to make a single API call for all requested images.
 */
export async function generateImages(prompt: string, apiKey: string, numImages: number): Promise<string[]> {
  const ai = new GoogleGenAI({ apiKey });
  
  const response = await ai.models.generateImages({
    model: 'imagen-4.0-generate-001',
    prompt: prompt,
    config: {
      numberOfImages: numImages,
      outputMimeType: 'image/jpeg',
      aspectRatio: '1:1',
    },
  });

  return response.generatedImages.map(img => img.image.imageBytes);
}


/**
 * Creates a ZIP file from a list of images and triggers a download.
 */
export async function createAndDownloadZip(images: { name: string; base64: string }[], zipFileName: string): Promise<void> {
  const zip = new JSZip();
  images.forEach(image => {
    zip.file(image.name, image.base64, { base64: true });
  });

  const content = await zip.generateAsync({ type: 'blob' });
  saveAs(content, `${zipFileName}.zip`);
}

/**
 * Downloads a single base64 image.
 */
export function downloadSingleImage(base64: string, fileName: string): void {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: 'image/jpeg' });
  saveAs(blob, `${fileName}.jpg`);
}

// --- Local Storage Service ---

export function loadHistory(): HistoryItem[] {
  try {
    const storedHistory = localStorage.getItem(HISTORY_KEY);
    return storedHistory ? JSON.parse(storedHistory) : [];
  } catch (error) {
    console.error("Failed to load history from local storage:", error);
    return [];
  }
}

export function saveHistory(history: HistoryItem[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch (error) {
    console.error("Failed to save history to local storage:", error);
  }
}

export function addToHistory(newResults: GenerationResult[]): HistoryItem[] {
    const currentHistory = loadHistory();
    const newItem: HistoryItem = {
      id: new Date().toISOString(),
      date: new Date().toLocaleString(),
      results: newResults,
    };
    const updatedHistory = [newItem, ...currentHistory];
    saveHistory(updatedHistory);
    return updatedHistory;
}

export function deleteHistoryItem(id: string): HistoryItem[] {
    const currentHistory = loadHistory();
    const updatedHistory = currentHistory.filter(item => item.id !== id);
    saveHistory(updatedHistory);
    return updatedHistory;
}

export function clearHistory(): void {
    try {
        localStorage.removeItem(HISTORY_KEY);
    } catch (error) {
        console.error("Failed to clear history from local storage:", error);
    }
}


export { isRateLimitError };