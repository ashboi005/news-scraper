import React from 'react';
import { NewsArticle } from '@/lib/api';

interface NewsCardProps {
  article: NewsArticle;
}

const NewsCard: React.FC<NewsCardProps> = ({ article }) => {
  // Format the timestamp for display, handle empty strings
  const formattedDate = article.timestamp ? new Date(article.timestamp).toLocaleString() : "";
  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow duration-300">
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">          <span className="inline-block bg-blue-100 text-blue-800 text-xs font-semibold px-2.5 py-0.5 rounded">
            {article.source}
          </span>
          {formattedDate && <span className="text-xs text-gray-500">{formattedDate}</span>}
        </div>
          <h2 className="text-lg text-gray-800 font-semibold mb-2 line-clamp-2">{article.title}</h2>
        
        {article.summary && (
          <p className="text-sm text-gray-600 mb-3 line-clamp-3">
            {article.summary}
          </p>
        )}
        
        <a 
          href={article.url} 
          target="_blank" 
          rel="noopener noreferrer"
          className="inline-block mt-2 text-blue-600 hover:underline"
        >
          Read more →
        </a>
      </div>
    </div>
  );
};

export default NewsCard;
