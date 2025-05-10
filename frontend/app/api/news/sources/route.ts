import { NextResponse } from 'next/server';

/**
 * GET /api/news/sources - Get all available news sources
 */
export async function GET() {
  return NextResponse.json({
    sources: [
      { id: 'bbc', name: 'BBC News' },
      { id: 'cnn', name: 'CNN' },
      { id: 'reuters', name: 'Reuters' },
      { id: 'dd news', name: 'DD News' },
      { id: 'pib', name: 'PIB' },
      { id: 'pti', name: 'PTI' },
      { id: 'firstpost', name: 'Firstpost' },
      { id: 'wion', name: 'WION' }
    ]
  });
}
