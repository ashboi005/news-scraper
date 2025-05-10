'use client';

import React, { useState, useEffect } from 'react';
import { fetchNews, fetchSources, NewsArticle, NewsSource } from '@/lib/api';
import NewsGrid from '@/components/NewsGrid';
import SourceSelector from '@/components/SourceSelector';

export default function Home() {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [sources, setSources] = useState<NewsSource[]>([]);
  const [activeSource, setActiveSource] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Load news sources
  useEffect(() => {
    const loadSources = async () => {
      try {
        const sourcesData = await fetchSources();
        setSources(sourcesData);
      } catch (err) {
        setError('Failed to load news sources. Please try again later.');
        console.error('Error loading sources:', err);
      }
    };
    
    loadSources();
  }, []);

  // Load news articles whenever active source changes
  useEffect(() => {
    const loadNews = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const newsData = await fetchNews(activeSource || undefined);
        setArticles(newsData);
      } catch (err) {
        setError('Failed to load news articles. Please try again later.');
        console.error('Error loading news:', err);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadNews();
  }, [activeSource]);

  // Handle source selection
  const handleSourceSelect = (sourceId: string | null) => {
    setActiveSource(sourceId);
  };

  // Handle refresh
  const handleRefresh = () => {
    setIsLoading(true);
    setError(null);
    fetchNews(activeSource || undefined)
      .then(data => {
        setArticles(data);
      })
      .catch(err => {
        setError('Failed to refresh news. Please try again later.');
        console.error('Error refreshing news:', err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="container mx-auto px-4 py-6 flex flex-col items-center">
          <h1 className="text-3xl font-bold text-gray-900">Indo Pak War News Aggregator</h1>
          <p className="mt-2 text-gray-600">Latest news about the ongoing conflict from verified sources at one place</p>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row md:justify-between md:items-center mb-6 gap-4">
          <SourceSelector 
            sources={sources} 
            activeSource={activeSource} 
            onSelectSource={handleSourceSelect} 
          />
          
          <button 
            onClick={handleRefresh}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            disabled={isLoading}
          >
            {isLoading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
        
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 rounded p-4 mb-6">
            {error}
          </div>
        )}
        
        <NewsGrid articles={articles} isLoading={isLoading} />
      </main>

      <footer className="bg-white border-t mt-12 py-6">
        <div className="container mx-auto px-4">
          <p className="text-center text-gray-500">
            © {new Date().getFullYear()} 
          </p>
          <p className="text-center text-gray-500">
            Website built with ❤️ by <span className="font-bold text-blue-500 underline"><a href="https://www.github.com/ashboi005">Ashwath</a></span>
          </p>
           <p className="text-center text-gray-500">
            Jai Hind! 🇮🇳
          </p>
        </div>
      </footer>
    </div>
  );
}
