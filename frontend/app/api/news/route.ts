import { NextRequest, NextResponse } from 'next/server';
import { getCachedNews } from '@/lib/news-service';

/**
 * GET /api/news - Get news articles, optionally filtered by source
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const source = searchParams.get('source');
    
    // Get the news data and last updated time
    const { articles, lastUpdated } = await getCachedNews(source || undefined);
    
    return NextResponse.json({
      data: articles,
      last_updated: lastUpdated,
      source: source ? source.toUpperCase() : 'all'
    });
  } catch (error) {
    console.error('Error in news API route:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve news' },
      { status: 500 }
    );
  }
}
