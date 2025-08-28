
import React from 'react';
import { HistoryItem } from '../types';
import { createAndDownloadZip, downloadSingleImage } from '../services/apiService';
import { Icon } from './Icons';

interface HistoryPageProps {
  history: HistoryItem[];
  onDeleteItem: (id: string) => void;
  onClearHistory: () => void;
}

export const HistoryPage: React.FC<HistoryPageProps> = ({ history, onDeleteItem, onClearHistory }) => {

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
