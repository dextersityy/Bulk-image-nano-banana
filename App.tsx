
import React, { useState, useEffect } from 'react';
import { Page, ApiKey, ApiKeyStatus, HistoryItem, GenerationResult } from './types';
import { GeneratorPage } from './components/GeneratorPage';
import { HistoryPage } from './components/HistoryPage';
import { Icon } from './components/Icons';
import { loadHistory, addToHistory, deleteHistoryItem, clearHistory } from './services/apiService';

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

export default App;
