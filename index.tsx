import React, { useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleGenAI } from "@google/genai";

// Ambient declarations for CDN scripts
declare var JSZip: any;
declare var saveAs: any;

// --- TYPES ---
enum ApiKeyStatus {
  Active = 'Active',
  RateLimited = 'Rate Limited',
}
interface ApiKey {
  key: string;
  status: ApiKeyStatus;
}
interface GenerationResult {
  prompt: string;
  images: string[]; // base64 strings
  error?: string;
}
interface HistoryItem {
  id: string;
  date: string;
  results: GenerationResult[];
}
type Page = 'generator' | 'history';

// --- API & LOCAL STORAGE SERVICE ---
const HISTORY_KEY = 'gemini-image-generator-history';

function isRateLimitError(error: any): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return message.includes('quota') || message.includes('rate limit');
  }
  return false;
}

async function generateImages(prompt: string, apiKey: string, numImages: number): Promise<string[]> {
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

async function createAndDownloadZip(images: { name: string; base64: string }[], zipFileName: string): Promise<void> {
  const zip = new JSZip();
  images.forEach(image => {
    zip.file(image.name, image.base64, { base64: true });
  });

  const content = await zip.generateAsync({ type: 'blob' });
  saveAs(content, `${zipFileName}.zip`);
}

function downloadSingleImage(base64: string, fileName: string): void {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: 'image/jpeg' });
  saveAs(blob, `${fileName}.jpg`);
}

function loadHistory(): HistoryItem[] {
  try {
    const storedHistory = localStorage.getItem(HISTORY_KEY);
    return storedHistory ? JSON.parse(storedHistory) : [];
  } catch (error) {
    console.error("Failed to load history from local storage:", error);
    return [];
  }
}

function saveHistory(history: HistoryItem[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch (error) {
    console.error("Failed to save history to local storage:", error);
  }
}

function addToHistory(newResults: GenerationResult[]): HistoryItem[] {
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

function deleteHistoryItem(id: string): HistoryItem[] {
    const currentHistory = loadHistory();
    const updatedHistory = currentHistory.filter(item => item.id !== id);
    saveHistory(updatedHistory);
    return updatedHistory;
}

function clearHistory(): void {
    try {
        localStorage.removeItem(HISTORY_KEY);
    } catch (error) {
        console.error("Failed to clear history from local storage:", error);
    }
}

// --- ICONS COMPONENT ---
interface IconProps {
  name: 'generate' | 'history' | 'download' | 'zip' | 'delete' | 'settings' | 'add' | 'info' | 'close';
  className?: string;
}

const Icon: React.FC<IconProps> = ({ name, className = 'w-6 h-6' }) => {
  switch (name) {
    case 'generate':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      );
    case 'history':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case 'download':
        return (
            <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
        );
    case 'zip':
        return (
            <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
        );
    case 'delete':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      );
    case 'settings':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      );
    case 'add':
        return (
            <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
        );
    case 'info':
        return (
            <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
        );
    case 'close':
        return (
             <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
        );
    default:
      return null;
  }
};

// --- HISTORY PAGE COMPONENT ---
interface HistoryPageProps {
  history: HistoryItem[];
  onDeleteItem: (id: string) => void;
  onClearHistory: () => void;
}
const HistoryPage: React.FC<HistoryPageProps> = ({ history, onDeleteItem, onClearHistory }) => {
  const handleClear = () => {
    if (window.confirm('Are you sure you want to delete all history? This action cannot be undone.')) {
        onClearHistory();
    }
  }
  const handleDownloadItemAsZip = (item: HistoryItem) => {
    const allImages: { name: string; base64: string }[] = [];
    item.results.forEach((result, resultIndex) => {
        if (result.images) {
            result.images.forEach((img, imgIndex) => {
                allImages.push({
                    name: `prompt-${resultIndex + 1}-${result.prompt.slice(0, 20).replace(/[^a-zA-Z0-9]/g, '_')}-${imgIndex+1}.jpg`,
                    base64: img
                });
            });
        }
    });
    if (allImages.length > 0) {
        createAndDownloadZip(allImages, `gemini-history-${item.id}`);
    } else {
        alert("This history item contains no images to download.");
    }
  };
  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center p-8 h-[calc(100vh-100px)]">
        <Icon name="history" className="w-16 h-16 text-gray-600 mb-4" />
        <h2 className="text-2xl font-bold text-white">No History Found</h2>
        <p className="text-gray-400 mt-2">Your generated images will appear here once you run a generation job.</p>
      </div>
    );
  }
  return (
    <div className="p-4 md:p-8">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-bold text-white">Generation History</h2>
        <button 
            onClick={handleClear}
            className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 transition-colors flex items-center gap-2 text-sm"
        >
          <Icon name="delete" className="w-4 h-4" /> Clear All History
        </button>
      </div>
      <div className="space-y-8">
        {history.map(item => (
          <div key={item.id} className="bg-gray-800 rounded-lg p-5">
            <div className="flex justify-between items-center border-b border-gray-700 pb-3 mb-4 flex-wrap gap-2">
              <h3 className="font-semibold text-lg text-cyan-400">{item.date}</h3>
              <div className="flex items-center gap-2">
                 <button 
                  onClick={() => handleDownloadItemAsZip(item)}
                  className="bg-green-600 text-white px-3 py-1.5 rounded-md hover:bg-green-700 transition-colors flex items-center gap-2 text-xs"
                >
                  <Icon name="zip" className="w-4 h-4" /> Download All
                </button>
                <button onClick={() => onDeleteItem(item.id)} className="text-gray-400 hover:text-red-400 p-1.5 rounded-md hover:bg-gray-700">
                    <Icon name="delete" className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="space-y-4">
              {item.results.map((result, index) => (
                <div key={index}>
                  <div className="flex justify-between items-center mb-3">
                    <p className="text-gray-300 font-medium">{result.prompt}</p>
                    {result.images.length > 0 && (
                        <button onClick={() => createAndDownloadZip(
                            result.images.map((img, i) => ({
                                name: `prompt-${item.id}-${i+1}.jpg`,
                                base64: img
                            })), `history-${item.id}-prompt-${index+1}`
                        )} className='bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700 transition-colors flex items-center gap-2 text-xs shrink-0 ml-4'>
                            <Icon name="zip" className="w-4 h-4" /> ZIP
                        </button>
                     )}
                  </div>
                  {result.error && <p className="text-red-400 text-sm">{result.error}</p>}
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                    {result.images.map((imgBase64, imgIndex) => (
                       <div key={imgIndex} className="relative group aspect-square">
                         <img src={`data:image/jpeg;base64,${imgBase64}`} alt={`${result.prompt} - ${imgIndex + 1}`} className="rounded-md w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                               <button onClick={() => downloadSingleImage(imgBase64, `history-${item.id}-${imgIndex+1}`)} className="text-white p-2 rounded-full bg-black/50 hover:bg-black/80">
                                   <Icon name="download" className="w-6 h-6"/>
                               </button>
                           </div>
                       </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// --- GENERATOR PAGE COMPONENT ---
interface GeneratorPageProps {
  apiKeys: ApiKey[];
  addApiKey: (key: string) => void;
  removeApiKey: (key: string) => void;
  updateApiKeyStatus: (key: string, status: ApiKeyStatus) => void;
  onGenerationComplete: (results: GenerationResult[]) => void;
}
const ApiKeyManager: React.FC<Omit<GeneratorPageProps, 'onGenerationComplete'>> = ({ apiKeys, addApiKey, removeApiKey, updateApiKeyStatus }) => {
  const [newApiKey, setNewApiKey] = useState('');
  const handleAddKey = () => {
    if (newApiKey.trim()) {
      addApiKey(newApiKey.trim());
      setNewApiKey('');
    }
  };
  const handleResetStatus = () => {
    apiKeys.forEach(k => {
      if(k.status === ApiKeyStatus.RateLimited) {
        updateApiKeyStatus(k.key, ApiKeyStatus.Active)
      }
    });
  };
  return (
    <div className="bg-gray-800 p-4 rounded-lg">
      <h3 className="text-lg font-semibold text-white mb-3">API Key Manager</h3>
      <div className="flex gap-2 mb-3">
        <input
          type="password"
          value={newApiKey}
          onChange={(e) => setNewApiKey(e.target.value)}
          placeholder="Enter new Gemini API Key"
          className="flex-grow bg-gray-900 text-gray-300 border border-gray-700 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none"
        />
        <button
          onClick={handleAddKey}
          className="bg-cyan-600 text-white px-4 py-2 rounded-md hover:bg-cyan-700 transition-colors flex items-center gap-2 text-sm"
        >
          <Icon name="add" className="w-4 h-4" /> Add
        </button>
      </div>
      <div className="space-y-2">
        {apiKeys.map(({ key, status }) => (
          <div key={key} className="flex items-center justify-between bg-gray-700 p-2 rounded-md text-sm">
            <span className="font-mono text-gray-400">...{key.slice(-6)}</span>
            <div className="flex items-center gap-3">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${status === ApiKeyStatus.Active ? 'bg-green-500/20 text-green-300' : 'bg-yellow-500/20 text-yellow-300'}`}>
                {status}
              </span>
              <button onClick={() => removeApiKey(key)} className="text-gray-400 hover:text-red-400">
                <Icon name="delete" className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
       {apiKeys.some(k => k.status === ApiKeyStatus.RateLimited) && (
        <button onClick={handleResetStatus} className="text-sm text-cyan-400 hover:text-cyan-300 mt-3">Reset all 'Rate Limited' keys to 'Active'</button>
      )}
    </div>
  );
};
const GeneratorPage: React.FC<GeneratorPageProps> = ({ apiKeys, addApiKey, removeApiKey, updateApiKeyStatus, onGenerationComplete }) => {
  const [prompts, setPrompts] = useState('');
  const [numImages, setNumImages] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [results, setResults] = useState<GenerationResult[]>([]);
  const [currentKeyIndex, setCurrentKeyIndex] = useState(0);
  const handleGenerate = useCallback(async () => {
    if (!prompts.trim()) {
      alert('Please enter at least one prompt.');
      return;
    }
    const activeKeys = apiKeys.filter(k => k.status === ApiKeyStatus.Active);
    if (activeKeys.length === 0) {
      alert('Please add at least one active API key.');
      return;
    }
    setIsLoading(true);
    setResults([]);
    setStatusMessage('Starting generation...');
    const promptsToProcess = prompts.trim().split('\n').filter(p => p.trim() !== '');
    const finalResults: GenerationResult[] = [];
    let keyIdx = currentKeyIndex % activeKeys.length;
    for (let i = 0; i < promptsToProcess.length; i++) {
        const prompt = promptsToProcess[i];
        let promptResult: GenerationResult | null = null;
        let success = false;
        let attempts = 0;
        setStatusMessage(`Processing prompt ${i + 1} of ${promptsToProcess.length}: "${prompt}"`);
        while (!success && attempts < activeKeys.length) {
            const apiKey = activeKeys[keyIdx];
            setStatusMessage(`[Prompt ${i + 1}/${promptsToProcess.length}] Trying key ...${apiKey.key.slice(-6)}`);
            try {
                const generatedImages = await generateImages(prompt, apiKey.key, numImages);
                promptResult = { prompt, images: generatedImages };
                success = true;
                setCurrentKeyIndex(keyIdx); 
            } catch (error: any) {
                console.error(error);
                if (isRateLimitError(error)) {
                    updateApiKeyStatus(apiKey.key, ApiKeyStatus.RateLimited);
                    setStatusMessage(`Key ...${apiKey.key.slice(-6)} rate limited. Switching...`);
                    keyIdx = (keyIdx + 1) % activeKeys.length;
                    attempts++;
                } else {
                    promptResult = { prompt, images: [], error: error.message || 'An unknown error occurred.' };
                    break;
                }
            }
        }
        if (!success) {
            promptResult = { prompt, images: [], error: 'All active API keys failed or are rate limited.' };
        }
        if (promptResult) {
            finalResults.push(promptResult);
            setResults(prev => [...prev, promptResult!]);
        }
    }
    onGenerationComplete(finalResults);
    setIsLoading(false);
    setStatusMessage('All prompts processed.');
  }, [prompts, apiKeys, numImages, currentKeyIndex, onGenerationComplete, updateApiKeyStatus]);
  const downloadAllAsZip = () => {
    const allImages: {name: string; base64: string}[] = [];
    results.forEach((result, resultIndex) => {
        result.images.forEach((img, imgIndex) => {
            allImages.push({
                name: `prompt-${resultIndex + 1}-${result.prompt.slice(0, 20).replace(/[^a-zA-Z0-9]/g, '_')}-${imgIndex+1}.jpg`,
                base64: img
            });
        });
    });
    if (allImages.length > 0) {
        createAndDownloadZip(allImages, 'gemini-bulk-generation-session');
    }
  }
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 p-4 md:p-8">
      <div className="lg:col-span-1 flex flex-col gap-6">
        <h2 className="text-3xl font-bold text-white">Generation Settings</h2>
        <ApiKeyManager apiKeys={apiKeys} addApiKey={addApiKey} removeApiKey={removeApiKey} updateApiKeyStatus={updateApiKeyStatus} />
        <div className="bg-gray-800 p-4 rounded-lg">
          <label htmlFor="prompts" className="block text-lg font-semibold text-white mb-2">Prompts</label>
          <p className="text-sm text-gray-400 mb-3">Enter one prompt per line. Each will be processed in order.</p>
          <textarea
            id="prompts"
            value={prompts}
            onChange={(e) => setPrompts(e.target.value)}
            rows={10}
            className="w-full bg-gray-900 text-gray-300 border border-gray-700 rounded-md p-3 focus:ring-2 focus:ring-cyan-500 focus:outline-none"
            placeholder="a cat wearing a spacesuit&#10;a dog surfing on a rainbow&#10;a photorealistic image of a futuristic city"
          />
        </div>
        <div className="bg-gray-800 p-4 rounded-lg">
          <label htmlFor="numImages" className="block text-lg font-semibold text-white mb-2">Images per Prompt</label>
          <div className="flex items-center gap-4">
            <input
              type="range"
              id="numImages"
              min="1"
              max="4"
              value={numImages}
              onChange={(e) => setNumImages(parseInt(e.target.value, 10))}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
            />
            <span className="text-xl font-bold text-cyan-400 w-8 text-center">{numImages}</span>
          </div>
        </div>
        <button
          onClick={handleGenerate}
          disabled={isLoading}
          className="w-full bg-cyan-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-cyan-700 transition-colors flex items-center justify-center gap-2 disabled:bg-gray-600 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Generating...' : <><Icon name="generate" className="w-5 h-5" /> Generate Images</>}
        </button>
      </div>
      <div className="lg:col-span-2">
        {!isLoading && results.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center bg-gray-800/50 rounded-lg p-8 text-center">
                <Icon name="info" className="w-12 h-12 text-gray-500 mb-4" />
                <h3 className="text-xl font-semibold text-white">Ready to Generate</h3>
                <p className="text-gray-400 mt-2">Enter your prompts and API keys on the left to get started.</p>
            </div>
        )}
        {isLoading && results.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center bg-gray-800/50 rounded-lg p-8">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-cyan-400"></div>
            <p className="text-white text-lg mt-4">Starting Generation...</p>
            <p className="text-gray-400 text-sm mt-2 text-center">{statusMessage}</p>
          </div>
        )}
        {results.length > 0 && (
          <div className="flex flex-col gap-6">
            <div className='flex justify-between items-center'>
              <h2 className="text-3xl font-bold text-white">{isLoading ? "Generating..." : "Results"}</h2>
              <button 
                onClick={downloadAllAsZip} 
                disabled={isLoading}
                className='bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition-colors flex items-center gap-2 text-sm disabled:bg-gray-600 disabled:cursor-not-allowed'
              >
                  <Icon name="zip" className="w-5 h-5" /> Download All (.zip)
              </button>
            </div>
            {results.map((result, index) => (
              <div key={index} className="bg-gray-800 p-4 rounded-lg">
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <h3 className="font-semibold text-white">{result.prompt}</h3>
                        {result.error && <p className="text-red-400 text-sm mt-1">{result.error}</p>}
                    </div>
                     {result.images.length > 0 && (
                        <button onClick={() => createAndDownloadZip(
                            result.images.map((img, i) => ({
                                name: `prompt-${index+1}-${i+1}.jpg`,
                                base64: img
                            })), `prompt-${result.prompt.slice(0, 20).replace(/[^a-zA-Z0-9]/g, '_')}`
                        )} className='bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700 transition-colors flex items-center gap-2 text-xs shrink-0 ml-4'>
                            <Icon name="zip" className="w-4 h-4" /> ZIP
                        </button>
                     )}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {result.images.map((imgBase64, imgIndex) => (
                    <div key={imgIndex} className="relative group">
                      <img src={`data:image/jpeg;base64,${imgBase64}`} alt={`${result.prompt} - ${imgIndex + 1}`} className="rounded-md w-full h-full object-cover" />
                       <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <button onClick={() => downloadSingleImage(imgBase64, `prompt-${index+1}-${imgIndex+1}`)} className="text-white p-2 rounded-full bg-black/50 hover:bg-black/80">
                                <Icon name="download" className="w-6 h-6"/>
                            </button>
                        </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex flex-col items-center justify-center bg-gray-800/50 rounded-lg p-6">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400"></div>
                  <p className="text-gray-400 text-sm mt-3 text-center">{statusMessage}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// --- APP COMPONENT ---
const API_KEYS_STORAGE_KEY = 'gemini-api-keys';
const Header: React.FC<{ currentPage: Page; onPageChange: (page: Page) => void }> = ({ currentPage, onPageChange }) => {
  const linkClasses = "px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2 transition-colors";
  const activeClasses = "bg-gray-700 text-white";
  const inactiveClasses = "text-gray-400 hover:bg-gray-800 hover:text-white";
  return (
    <header className="bg-gray-900 shadow-md p-4 flex justify-between items-center border-b border-gray-700">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-gradient-to-tr from-cyan-500 to-blue-600 rounded-full flex items-center justify-center">
            <Icon name="generate" className="w-5 h-5 text-white"/>
        </div>
        <h1 className="text-xl font-bold text-white">Gemini Bulk Image Generator</h1>
      </div>
      <nav className="flex items-center gap-2 bg-gray-900 border border-gray-700 rounded-lg p-1">
        <button 
          onClick={() => onPageChange('generator')} 
          className={`${linkClasses} ${currentPage === 'generator' ? activeClasses : inactiveClasses}`}
        >
          <Icon name="generate" className="w-5 h-5" /> Generator
        </button>
        <button 
          onClick={() => onPageChange('history')} 
          className={`${linkClasses} ${currentPage === 'history' ? activeClasses : inactiveClasses}`}
        >
          <Icon name="history" className="w-5 h-5" /> History
        </button>
      </nav>
    </header>
  );
};
function App() {
  const [page, setPage] = useState<Page>('generator');
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  useEffect(() => {
    try {
      const storedKeys = localStorage.getItem(API_KEYS_STORAGE_KEY);
      if (storedKeys) {
        setApiKeys(JSON.parse(storedKeys));
      }
      setHistory(loadHistory());
    } catch (error) {
        console.error("Failed to load data from local storage:", error);
    }
  }, []);
  const updateApiKeys = (newKeys: ApiKey[]) => {
    setApiKeys(newKeys);
    localStorage.setItem(API_KEYS_STORAGE_KEY, JSON.stringify(newKeys));
  };
  const addApiKey = (key: string) => {
    if (!apiKeys.some(k => k.key === key)) {
      updateApiKeys([...apiKeys, { key, status: ApiKeyStatus.Active }]);
    }
  };
  const removeApiKey = (key: string) => {
    updateApiKeys(apiKeys.filter(k => k.key !== key));
  };
  const updateApiKeyStatus = (key: string, status: ApiKeyStatus) => {
    updateApiKeys(apiKeys.map(k => k.key === key ? { ...k, status } : k));
  };
  const handleGenerationComplete = (results: GenerationResult[]) => {
    if (results.some(r => r.images.length > 0)) {
       const updatedHistory = addToHistory(results);
       setHistory(updatedHistory);
    }
  }
  const handleDeleteHistoryItem = (id: string) => {
    const updatedHistory = deleteHistoryItem(id);
    setHistory(updatedHistory);
  }
  const handleClearHistory = () => {
    clearHistory();
    setHistory([]);
  }
  return (
    <div className="min-h-screen bg-gray-900 text-gray-300">
      <Header currentPage={page} onPageChange={setPage} />
      <main>
        {page === 'generator' && (
          <GeneratorPage 
            apiKeys={apiKeys} 
            addApiKey={addApiKey} 
            removeApiKey={removeApiKey} 
            updateApiKeyStatus={updateApiKeyStatus}
            onGenerationComplete={handleGenerationComplete}
          />
        )}
        {page === 'history' && <HistoryPage history={history} onDeleteItem={handleDeleteHistoryItem} onClearHistory={handleClearHistory} />}
      </main>
    </div>
  );
}

// --- RENDER APP ---
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}
const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);