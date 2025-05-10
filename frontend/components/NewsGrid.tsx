import React from 'react';
import NewsCard from './NewsCard';
import { NewsArticle } from '@/lib/api';

interface NewsGridProps {
  articles: NewsArticle[];
  isLoading: boolean;
}

const NewsGrid: React.FC<NewsGridProps> = ({ articles, isLoading }) => {
  if (isLoading) {
    return (
      <div className="flex flex-col justify-center items-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div>
        <p className="text-gray-600">Fetching latest news...</p>
      </div>
    );
  }

  if (articles.length === 0) {
    return (
      <div className="text-center py-12 bg-gray-50 rounded-lg border border-gray-200">
        <svg className="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
        </svg>
        <p className="text-gray-500 mb-2">No news articles found.</p>
        <p className="text-gray-400 text-sm">Try selecting a different source or refresh the page.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {articles.map((article, index) => (
        <NewsCard key={`${article.source}-${index}`} article={article} />
      ))}
    </div>
  );
};

export default NewsGrid;
