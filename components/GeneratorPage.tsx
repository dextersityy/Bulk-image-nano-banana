import React, { useState, useCallback, useRef } from 'react';
import { ApiKey, ApiKeyStatus, GenerationResult } from '../types';
import { generateImages, isRateLimitError, createAndDownloadZip, downloadSingleImage, getErrorMessage, isPromptError } from '../services/apiService';
import { Icon } from './Icons';

interface GeneratorPageProps {
  apiKeys: ApiKey[];
  addApiKey: (key: string) => void;
  removeApiKey: (key: string) => void;
  updateApiKeyStatus: (key: string, status: ApiKeyStatus) => void;
  onGenerationUpdate: (sessionId: string, results: GenerationResult[]) => void;
}

const ApiKeyManager: React.FC<Omit<GeneratorPageProps, 'onGenerationUpdate'>> = ({ apiKeys, addApiKey, removeApiKey, updateApiKeyStatus }) => {
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
              <button onClick={() => removeApiKey(key)} className="text-gray-400 hover:text-red-400" title="Remove API Key">
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


export const GeneratorPage: React.FC<GeneratorPageProps> = ({ apiKeys, addApiKey, removeApiKey, updateApiKeyStatus, onGenerationUpdate }) => {
  const [prompts, setPrompts] = useState('');
  const [numImages, setNumImages] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [results, setResults] = useState<GenerationResult[]>([]);
  const [currentKeyIndex, setCurrentKeyIndex] = useState(0);
  const stopRequest = useRef(false);

  const handleGenerate = useCallback(async () => {
    if (!prompts.trim()) {
      alert('Please enter at least one prompt.');
      return;
    }
    const initialActiveKeys = apiKeys.filter(k => k.status === ApiKeyStatus.Active);
    if (initialActiveKeys.length === 0) {
      alert('Please add at least one active API key.');
      return;
    }

    setIsLoading(true);
    stopRequest.current = false;
    setResults([]);
    setStatusMessage('Starting generation...');
    
    const promptsToProcess = prompts.trim().split('\n').filter(p => p.trim() !== '');
    const finalResults: GenerationResult[] = [];
    let keyIdx = currentKeyIndex;
    const sessionId = new Date().toISOString();

    for (let i = 0; i < promptsToProcess.length; i++) {
        if (stopRequest.current) {
            setStatusMessage('Generation stopped by user.');
            break;
        }

        const prompt = promptsToProcess[i];
        let promptResult: GenerationResult | null = null;
        let success = false;
        let attempts = 0;
        
        setStatusMessage(`Processing prompt ${i + 1} of ${promptsToProcess.length}: "${prompt}"`);

        const activeKeysForPrompt = apiKeys.filter(k => k.status === ApiKeyStatus.Active);

        while (!success && attempts < activeKeysForPrompt.length) {
            if (stopRequest.current) break;

            const currentActiveKeys = apiKeys.filter(k => k.status === ApiKeyStatus.Active);
            if (currentActiveKeys.length === 0) {
                promptResult = { prompt, images: [], error: 'All available keys are rate-limited.' };
                break;
            }
            
            keyIdx = keyIdx % currentActiveKeys.length;
            const apiKey = currentActiveKeys[keyIdx];
            setStatusMessage(`[Prompt ${i + 1}/${promptsToProcess.length}] Trying key ...${apiKey.key.slice(-6)}`);
            
            try {
                const generatedImages = await generateImages(prompt, apiKey.key, numImages);
                promptResult = { prompt, images: generatedImages };
                success = true;
                setCurrentKeyIndex(keyIdx); 
            } catch (error: any) {
                // Use JSON.stringify to prevent '[object Object]' in console for raw API errors
                console.error(`API key ...${apiKey.key.slice(-6)} failed:`, error instanceof Error ? error : JSON.stringify(error, null, 2));

                if (isPromptError(error)) {
                    // This is a prompt-specific error, so we should stop trying other keys for it.
                    promptResult = { prompt, images: [], error: getErrorMessage(error) };
                    break;
                }

                if (isRateLimitError(error)) {
                    updateApiKeyStatus(apiKey.key, ApiKeyStatus.RateLimited);
                    setStatusMessage(`Key ...${apiKey.key.slice(-6)} rate limited. Cooling down for 2s...`);
                    if (!stopRequest.current) await new Promise(resolve => setTimeout(resolve, 2000));
                } else {
                    // For other errors (invalid key, server issues), mark the key and move to the next.
                    updateApiKeyStatus(apiKey.key, ApiKeyStatus.RateLimited);
                    const errorMessage = getErrorMessage(error);
                    setStatusMessage(`Key ...${apiKey.key.slice(-6)} failed. Trying next key.`);
                    console.warn(`Error for key ...${apiKey.key.slice(-6)}: ${errorMessage}`);
                }
                
                // For key-related errors, we increment attempts to try the next available key.
                attempts++;
                keyIdx++;
            }
        }
        if (stopRequest.current) break;

        if (!success && !promptResult) {
            promptResult = { prompt, images: [], error: 'All active API keys failed or are rate limited.' };
        }

        if (promptResult) {
            finalResults.push(promptResult);
            setResults(prev => [...prev, promptResult!]);
            if (promptResult.images.length > 0 || promptResult.error) {
              onGenerationUpdate(sessionId, [...finalResults]);
            }
        }
    }
    
    if (!stopRequest.current) {
        setStatusMessage('All prompts processed.');
    }
    setIsLoading(false);
  }, [prompts, apiKeys, numImages, currentKeyIndex, onGenerationUpdate, updateApiKeyStatus]);
  
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

  const handleStop = () => {
    stopRequest.current = true;
    setStatusMessage("Stopping generation...");
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 p-4 md:p-8">
      {/* --- CONTROLS --- */}
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
            disabled={isLoading}
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
              disabled={isLoading}
            />
            <span className="text-xl font-bold text-cyan-400 w-8 text-center">{numImages}</span>
          </div>
        </div>

        {!isLoading ? (
            <button
            onClick={handleGenerate}
            className="w-full bg-cyan-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-cyan-700 transition-colors flex items-center justify-center gap-2"
            >
            <Icon name="generate" className="w-5 h-5" /> Generate Images
            </button>
        ) : (
            <button
            onClick={handleStop}
            className="w-full bg-red-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
            >
            <Icon name="close" className="w-5 h-5" /> Stop Generation
            </button>
        )}
      </div>

      {/* --- RESULTS --- */}
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
                disabled={isLoading && results.flatMap(r => r.images).length === 0}
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
                        {result.error && <p className="text-red-400 text-sm mt-1 break-all">Error: {result.error}</p>}
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
                    <div key={imgIndex} className="relative group aspect-square">
                      <img src={`data:image/jpeg;base64,${imgBase64}`} alt={`${result.prompt} - ${imgIndex + 1}`} className="rounded-md w-full h-full object-cover bg-gray-700" />
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