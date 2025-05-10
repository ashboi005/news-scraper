import React from 'react';
import { NewsSource } from '@/lib/api';

interface SourceSelectorProps {
  sources: NewsSource[];
  activeSource: string | null;
  onSelectSource: (sourceId: string | null) => void;
}

const SourceSelector: React.FC<SourceSelectorProps> = ({ 
  sources, 
  activeSource, 
  onSelectSource 
}) => {
  return (
    <div className="flex flex-wrap gap-2 mb-6">
      <button
        onClick={() => onSelectSource(null)}
        className={`px-4 py-2 rounded-full text-sm font-medium transition-colors
          ${activeSource === null 
            ? 'bg-blue-600 text-white' 
            : 'bg-gray-200 hover:bg-gray-300 text-gray-800'
          }`}
      >
        All Sources
      </button>
      
      {sources.map((source) => (
        <button
          key={source.id}
          onClick={() => onSelectSource(source.id)}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors
            ${activeSource === source.id 
              ? 'bg-blue-600 text-white' 
              : 'bg-gray-200 hover:bg-gray-300 text-gray-800'
            }`}
        >
          {source.name}
        </button>
      ))}
    </div>
  );
};

export default SourceSelector;
