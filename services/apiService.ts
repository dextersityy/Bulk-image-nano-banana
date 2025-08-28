// FIX: Added ambient declarations for JSZip and saveAs to resolve TypeScript errors.
// These variables are available globally from CDN scripts.
declare var JSZip: any;
declare var saveAs: any;

import { GenerationResult, HistoryItem } from '../types';

const HISTORY_KEY = 'gemini-image-generator-history';

/**
 * Extracts a user-friendly error message from various error formats.
 * This is updated to provide more detail for unexpected error structures.
 */
export function getErrorMessage(error: any): string {
  if (!error) return 'An unknown error occurred.';

  // Gemini API error structure from fetch: { error: { message: "..." } }
  const errorDetails = error.error || error;
  if (typeof errorDetails === 'object' && !Array.isArray(errorDetails) && errorDetails.message) {
      return errorDetails.message;
  }
  
  if (typeof error === 'string') {
    return error;
  }
  
  // As a fallback, try to stringify the error object for the UI.
  try {
    const stringifiedError = JSON.stringify(error);
    if (stringifiedError !== '{}') { // Avoid returning an empty object string
        return stringifiedError;
    }
  } catch (e) {
    // Cannot be stringified
  }
  
  return 'An unknown error occurred. Check the console for details.';
}


/**
 * Checks if an error object indicates a rate limit error from the API.
 * This is updated to handle the raw fetch JSON error object.
 */
function isRateLimitError(error: any): boolean {
  if (!error) return false;

  const details = error.error || error; 
  if (details?.status === 'RESOURCE_EXHAUSTED' || details?.code === 429) {
    return true;
  }

  const message = getErrorMessage(error).toLowerCase();
  
  return message.includes('quota') || message.includes('rate limit') || message.includes('resource exhausted');
}

/**
 * Checks if the error is due to a blocked prompt.
 */
export function isPromptError(error: any): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes('prompt is not allowed') || message.includes('prompt was blocked');
}


/**
 * Generates a set of images for a single prompt using a direct `fetch` call to the Gemini REST API.
 * This bypasses the @google/genai SDK to ensure the correct API key is always used via the `x-goog-api-key` header.
 */
export async function generateImages(prompt: string, apiKey: string, numImages: number): Promise<string[]> {
  if (!apiKey || apiKey.trim() === '') {
    throw new Error('A valid API key must be provided to generate images.');
  }

  const url = 'https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:generateImages';

  const payload = {
    prompt: prompt,
    config: {
      numberOfImages: numImages,
      outputMimeType: 'image/jpeg',
      aspectRatio: '1:1',
    },
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(payload),
      credentials: 'omit', // Prevent browser from sending auth cookies/headers, forcing use of api-key
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Gemini API Error Response:', data);
      throw data; // Throw the JSON error object for parsing by the UI
    }
    
    if (!data.generatedImages || !Array.isArray(data.generatedImages)) {
      console.error('Invalid success response format:', data);
      throw new Error("Invalid response format from API. Expected 'generatedImages' array.");
    }

    return data.generatedImages.map((img: any) => img.image.imageBytes);

  } catch (error) {
    // If fetch fails (network error) or if response isn't JSON, it won't have the 'error' property
    if (error instanceof Error && !('error' in (error as object))) {
        console.error('Fetch/Network Error:', error);
        throw new Error(`Failed to call the Gemini API. Please check your network connection or console for details.`);
    }
    // Re-throw API errors to be handled by the UI logic
    throw error;
  }
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

/**
 * Creates a new history item or updates an existing one for a given session.
 * This is used to save progress incrementally.
 */
export function updateHistory(sessionId: string, newResults: GenerationResult[]): HistoryItem[] {
    const currentHistory = loadHistory();
    const itemIndex = currentHistory.findIndex(item => item.id === sessionId);
    let updatedHistory;

    if (itemIndex > -1) {
        // Update existing item in the history array
        updatedHistory = [...currentHistory];
        updatedHistory[itemIndex].results = newResults;
    } else {
        // Create a new history item
        const newItem: HistoryItem = {
            id: sessionId,
            date: new Date().toLocaleString(),
            results: newResults,
        };
        updatedHistory = [newItem, ...currentHistory];
    }
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