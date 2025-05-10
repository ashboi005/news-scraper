/**
 * API client for the News API
 */

// Using the NextJS API instead of the Python backend
const API_BASE_URL = '/api';

export interface NewsArticle {
  source: string;
  title: string;
  url: string;
  timestamp: string;
  summary?: string;
}

export interface NewsSource {
  id: string;
  name: string;
}

/**
 * Fetch news articles with optional source filter
 */
export async function fetchNews(source?: string): Promise<NewsArticle[]> {
  const url = `${API_BASE_URL}/news${source ? `?source=${source}` : ''}`;
  
  console.log("Fetching news from:", url);
  
  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json'
      },
      cache: 'no-store',  // Don't cache results to always get fresh data
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`API error details: Status ${response.status}, Response: ${errorText}`);
      throw new Error(`API error: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    console.log("News data received:", data);
    return data.data || [];
  } catch (error) {
    console.error('Error fetching news:', error);
    throw error; // Rethrow to allow component-level error handling
  }
}

/**
 * Fetch all available news sources
 */
export async function fetchSources(): Promise<NewsSource[]> {
  const url = `${API_BASE_URL}/news/sources`;
  
  console.log("Fetching sources from:", url);
  
  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json'
      },
      cache: 'no-store',
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`API error details: Status ${response.status}, Response: ${errorText}`);
      throw new Error(`API error: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    console.log("Sources data received:", data);
    return data.sources || [];
  } catch (error) {
    console.error('Error fetching sources:', error);
    throw error; // Rethrow to allow component-level error handling
  }
}
