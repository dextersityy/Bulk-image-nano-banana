// FIX: Added ambient declarations for JSZip and saveAs to resolve TypeScript errors.
// These variables are available globally from CDN scripts.
declare var JSZip: any;
declare var saveAs: any;

import { GenerationResult, HistoryItem, AIService } from '../types';

const HISTORY_KEY = 'gemini-image-generator-history';

/**
 * Extracts a user-friendly error message from various error formats.
 * This is updated to provide more detail for unexpected error structures from both Gemini and OpenAI.
 */
export function getErrorMessage(error: any): string {
  if (!error) return 'An unknown error occurred.';

  const errorDetails = error.error || error;
  if (typeof errorDetails === 'object' && !Array.isArray(errorDetails) && errorDetails.message) {
      return errorDetails.message;
  }
  
  if (typeof error === 'string') {
    return error;
  }
  
  try {
    const stringifiedError = JSON.stringify(error);
    if (stringifiedError !== '{}') {
        return stringifiedError;
    }
  } catch (e) {
    // Cannot be stringified
  }
  
  return 'An unknown error occurred. Check the console for details.';
}


/**
 * Checks if an error object indicates a rate limit error from the API.
 */
function isRateLimitError(error: any): boolean {
  if (!error) return false;

  const details = error.error || error; 
  if (details?.status === 'RESOURCE_EXHAUSTED' || details?.code === 429) {
    return true;
  }
  
  if (details?.code === 'rate_limit_exceeded') { // OpenAI specific
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
  // Gemini: "prompt is not allowed", "prompt was blocked"
  // OpenAI: "your request was rejected as a result of our safety system"
  return message.includes('prompt') || message.includes('safety');
}

/**
 * Generates images using the Google Gemini API.
 */
async function generateImagesGemini(prompt: string, apiKey: string, numImages: number): Promise<string[]> {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:generateImages';
  const payload = {
    prompt: prompt,
    config: {
      numberOfImages: numImages,
      outputMimeType: 'image/jpeg',
      aspectRatio: '1:1',
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify(payload),
    credentials: 'omit',
  });

  const data = await response.json();

  if (!response.ok) {
    console.error('Gemini API Error Response:', data);
    throw data;
  }
  
  if (!data.generatedImages || !Array.isArray(data.generatedImages)) {
    console.error('Invalid Gemini success response format:', data);
    throw new Error("Invalid response format from Gemini. Expected 'generatedImages' array.");
  }

  return data.generatedImages.map((img: any) => img.image.imageBytes);
}

/**
 * Generates an image using the OpenAI DALL-E 3 API.
 * Note: DALL-E 3 API generates one image at a time.
 */
async function generateImagesOpenAI(prompt: string, apiKey: string): Promise<string[]> {
    const url = 'https://api.openai.com/v1/images/generations';
    const payload = {
        model: "dall-e-3",
        prompt: prompt,
        n: 1,
        size: "1024x1024",
        response_format: "b64_json",
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
        console.error('OpenAI API Error Response:', data);
        throw data;
    }

    if (!data.data || !Array.isArray(data.data) || !data.data[0]?.b64_json) {
        console.error('Invalid OpenAI success response format:', data);
        throw new Error("Invalid response format from OpenAI. Expected 'data' array with 'b64_json'.");
    }

    return [data.data[0].b64_json];
}

/**
 * Main dispatcher function to generate images from the selected AI service.
 */
export async function generateImages(prompt: string, apiKey: string, numImages: number, service: AIService): Promise<string[]> {
  if (!apiKey || apiKey.trim() === '') {
    throw new Error('A valid API key must be provided.');
  }

  try {
    switch (service) {
      case AIService.Gemini:
        return await generateImagesGemini(prompt, apiKey, numImages);
      case AIService.OpenAI:
        // DALL-E 3 only supports 1 image at a time, so numImages is ignored.
        return await generateImagesOpenAI(prompt, apiKey);
      default:
        throw new Error(`Unsupported AI service: ${service}`);
    }
  } catch (error) {
    if (error instanceof Error && !('error' in (error as object))) {
        console.error(`${service} Fetch/Network Error:`, error);
        throw new Error(`Failed to call the ${service} API. Please check your network connection or console for details.`);
    }
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
 */
export function updateHistory(sessionId: string, newResults: GenerationResult[]): HistoryItem[] {
    const currentHistory = loadHistory();
    const itemIndex = currentHistory.findIndex(item => item.id === sessionId);
    let updatedHistory;

    if (itemIndex > -1) {
        updatedHistory = [...currentHistory];
        updatedHistory[itemIndex].results = newResults;
    } else {
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
