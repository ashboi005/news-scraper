import { NextRequest, NextResponse } from 'next/server';
import { getCachedNews } from '@/lib/news-service';

export const maxDuration = 58; // Set max duration to 58 seconds (just under Vercel's 60s limit)

export async function GET(request: NextRequest) {
  try {
    const source = request.nextUrl.searchParams.get('source') || undefined;
    
    const { data, lastUpdated } = await getCachedNews(source);
    
    return NextResponse.json({
      data,
      last_updated: lastUpdated?.toISOString(),
      source: source || 'all'
    });
  } catch (error) {
    console.error('Error in news API route:', error);
    return NextResponse.json(
      { error: 'Failed to fetch news', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
