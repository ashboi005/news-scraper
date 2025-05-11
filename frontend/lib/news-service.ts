import { NewsArticle } from './api';
import axios from 'axios';
import * as cheerio from 'cheerio';

// Cache settings
const CACHE_EXPIRY_SECONDS = 30 * 60; // 30 minutes instead of 10
let newsCache: Record<string, NewsArticle[]> = {};
let lastUpdate: Date | null = null;

// Add pre-scraped fallback data
const FALLBACK_NEWS: Record<string, NewsArticle[]> = {
  "BBC": [
    {
      "source": "BBC",
      "title": "Pakistan military says it hit militant hideouts inside Iran",
      "url": "https://www.bbc.com/news/world-asia-68128572",
      "timestamp": new Date().toISOString(),
      "summary": "Pakistan has conducted strikes inside Iran targeting separatist militants, its foreign ministry says."
    },
    // Add 4-5 more fallback articles for BBC
  ],
  "CNN": [
    // Add 4-5 fallback CNN articles
  ]
  // Add fallback data for other sources
};

// News filter keywords
const NEWS_FILTER_KEYWORDS = [
  "pakistan", "war", "jammu", "Punjab", "drone", "army", "defense", "missiles", 
  "air", "navy", "border", "drones", "artillery", "shelling", "shells", "military", 
  "blasts", "kashmir", "rajasthan", "civilians", "injury", "pak", "jets", "bombs", 
  "loc", "gunfire"
];

/**
 * Get cached news, refreshing if necessary
 */
export async function getCachedNews(source?: string) {
  // Check if we have fresh cache
  const currentTime = new Date();
  if (lastUpdate && ((currentTime.getTime() - lastUpdate.getTime()) / 1000 < CACHE_EXPIRY_SECONDS)) {
    // Return cached data
    if (source) {
      return {
        data: newsCache[source.toUpperCase()] || [],
        lastUpdated: lastUpdate
      };
    } else {
      // Return all news
      let allNews: NewsArticle[] = [];
      for (const sourceNews of Object.values(newsCache)) {
        allNews = allNews.concat(sourceNews);
      }
      return { data: allNews, lastUpdated: lastUpdate };
    }
  }

  // Set up a timeout promise
  const timeoutPromise = new Promise<{data: NewsArticle[], lastUpdated: Date | null}>((_, reject) => {
    setTimeout(() => {
      reject(new Error('Scraping timeout exceeded'));
    }, 50000); // 50 seconds timeout (to stay under Vercel's 60s limit)
  });

  // Set up the scraping promise
  const scrapingPromise = updateNewsCache().then(() => {
    if (source) {
      return {
        data: newsCache[source.toUpperCase()] || [],
        lastUpdated: lastUpdate
      };
    } else {
      let allNews: NewsArticle[] = [];
      for (const sourceNews of Object.values(newsCache)) {
        allNews = allNews.concat(sourceNews);
      }
      return { data: allNews, lastUpdated: lastUpdate };
    }
  });

  // Race the promises
  try {
    return await Promise.race([scrapingPromise, timeoutPromise]);
  } catch (error) {
    console.warn('Using fallback news data due to timeout', error);
    
    // Use fallback data
    if (source) {
      return {
        data: FALLBACK_NEWS[source.toUpperCase()] || [],
        lastUpdated: new Date()
      };
    } else {
      let allNews: NewsArticle[] = [];
      for (const sourceNews of Object.values(FALLBACK_NEWS)) {
        allNews = allNews.concat(sourceNews);
      }
      return { data: allNews, lastUpdated: new Date() };
    }
  }
}

/**
 * Update the news cache with fresh data from all sources
 */
async function updateNewsCache() {
  try {
    // First, scrape the fast sources in parallel
    const fastSources = [scrapeBBC, scrapeCNN, scrapeWION];
    console.info("Starting to scrape fast sources (BBC, CNN, WION)...");
    
    const fastResults = await Promise.allSettled(fastSources.map(scraper => scraper()));
    
    // Update the cache with results from fast sources
    fastResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const sourceName = ['BBC', 'CNN', 'WION'][index];
        newsCache[sourceName] = result.value;
      }
    });
    
    // Update timestamp after fast sources complete
    lastUpdate = new Date();
    
    // Now, try the slower sources one by one with shorter timeouts
    // This ensures that even if these time out or fail, we already have the fast sources' data
    console.info("Now attempting to scrape slower sources (Reuters, DD News, PIB, PTI, Firstpost)...");
    
    // Define the slower sources
    const slowerSources = [
      { name: 'REUTERS', scraper: scrapeReuters },
      { name: 'DD NEWS', scraper: scrapeDDNews },
      { name: 'PIB', scraper: scrapePIB },
      { name: 'FIRSTPOST', scraper: scrapeFirstpost }
    ];
    
    // Try each slower source one at a time with a short timeout
    for (const { name, scraper } of slowerSources) {
      try {
        console.info(`Attempting to scrape ${name}...`);
        
        // Create a timeout promise for each slower source
       const timeoutPromise = new Promise<NewsArticle[]>((_, reject) => {
          // Custom timeouts by source
          let timeout = 8000; // Default
          if (name === 'DD NEWS') {
            timeout = 15000; // 15 seconds for DD News
          } else if (name === 'PIB') {
            timeout = 50000; // 50 seconds specifically for PIB
          } else if (name === 'FIRSTPOST') {
            timeout = 50000; // 20 seconds for Firstpost
          }
          
          setTimeout(() => {
            reject(new Error(`Scraping timeout for ${name}`));
          }, timeout);
        });
        // Race the scraper against the timeout
        const articles = await Promise.race([
          scraper(),
          timeoutPromise
        ]);
        
        // If we get here, the scraper completed before the timeout
        newsCache[name] = articles;
        console.info(`Successfully scraped ${articles.length} articles from ${name}`);
      } catch (error) {
        console.warn(`Failed to scrape ${name}:`, error);
        // If we don't already have articles for this source, use the fallback data
        if (!newsCache[name] || newsCache[name].length === 0) {
          newsCache[name] = FALLBACK_NEWS[name] || [];
          console.info(`Using ${newsCache[name].length} fallback articles for ${name}`);
        }
      }
    }
    
    // Log final summary
    console.info('News scraping complete - articles per source:', 
      Object.entries(newsCache).reduce((acc, [source, articles]) => {
        acc[source] = articles.length;
        return acc;
      }, {} as Record<string, number>)
    );
    
    return newsCache;
  } catch (error) {
    console.error('Error updating news cache:', error);
    throw error;
  }
}

/**
 * Scrape latest news from BBC India website
 */
async function scrapeBBC(): Promise<NewsArticle[]> {
  try {
    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9"
    };
    
    // Try both India-specific and South Asia URLs, plus additional URLs for more coverage
    const urls = [
      "https://www.bbc.com/news/world/asia/india",
      "https://www.bbc.com/news/world/asia",
      "https://www.bbc.com/news/topics/c8nq32jw5r5t", // BBC's India topic page
      "https://www.bbc.com/news/world", // World news might include India
      "https://www.bbc.com/news/world/asia-pacific", // Asia-Pacific
      "https://www.bbc.co.uk/news/topics/cx1m7zg01xpt/india" // BBC UK's India page
    ];
    
    const articles: NewsArticle[] = [];
    
    for (const url of urls) {
      try {
        console.info(`Fetching BBC URL: ${url}`);
        const response = await axios.get(url, { 
          headers, 
          timeout: 8000, // Reduce from 15000 to 8000ms
          maxRedirects: 5 
        });
        
        const html = response.data;
        const $ = cheerio.load(html);
          // Find all news items on the page - try multiple selectors
        const selectors = [
          ".gs-c-promo", 
          "[data-component='card']", 
          "[data-component='topic-list']", 
          ".nw-c-feature-card",
          "[data-entityid]", // BBC uses entityid for their article blocks
          ".ssrcss-1mrs5ns-PromoWrapper", // Modern BBC selectors
          ".ssrcss-1f3bvyz-StyledLink" // BBC link styles
        ];
        
        const newsItems: any[] = [];
        for (const selector of selectors) {
          $(selector).each(function(_, elem) {
            newsItems.push(elem);
            return true;
          });
        }
        
        // If we didn't find any elements with our selectors, try to get all divs with links
        if (newsItems.length === 0) {
          $("#main-content a, .content-wrapper a").each((_, elem) => {
            const href = $(elem).attr('href');
            if (href && href.includes('/news/') && $(elem).text().trim()) {
              newsItems.push(elem);
            }
          });
        }
        
        console.info(`Found ${newsItems.length} potential news items on ${url}`);
          // Process all articles
        for (const item of newsItems) {
          let title: string | null = null;
          let link: string | null = null;
          let summary: string = "";
          
          // If the item itself is a link
          if (item.name === 'a') {
            link = $(item).attr('href') || '';
            title = $(item).text().trim();
          } else {
            // For title - expanded selectors
            const titleSelectors = [
              ".gs-c-promo-heading__title", 
              "[data-testid='card-headline']", 
              "h3", "h4",
              ".ssrcss-6arcww-PromoHeadline",
              ".ssrcss-1q0x1qg-Headline",
              ".media__title",
              ".title-link"
            ];
            
            for (const selector of titleSelectors) {
              const titleElem = $(item).find(selector).first();
              if (titleElem.length > 0) {
                title = titleElem.text().trim();
                break;
              }
            }
            
            // For link - expanded selectors
            const linkSelectors = [
              ".gs-c-promo-heading", 
              "a",
              ".ssrcss-1mrs5ns-PromoWrapper a",
              ".title-link"
            ];
            
            for (const selector of linkSelectors) {
              const linkElem = $(item).find(selector).first();              if (linkElem.length > 0 && linkElem.attr('href')) {
                link = linkElem.attr('href') || null;
                break;
              }
            }
              // For summary - expanded selectors
            const summarySelectors = [
              ".gs-c-promo-summary", 
              "[data-testid='card-description']", 
              "p", 
              ".nw-c-card__body",
              ".ssrcss-q4by3k-PromoText",
              ".media__summary"
            ];
            
            for (const selector of summarySelectors) {
              const summaryElem = $(item).find(selector).first();
              if (summaryElem.length > 0) {
                summary = summaryElem.text().trim();
                break;
              }
            }
          }
          
          if (title && link) {
            // Make sure link is absolute URL
            if (!link.startsWith("http")) {
              if (link.startsWith("/")) {
                link = `https://www.bbc.com${link}`;
              } else {
                link = `https://www.bbc.com/${link}`;
              }
            }
              // Look for timestamp
            let timestamp = "";
            const timeSelectors = [
              "[data-testid='card-metadata-lastupdated']",
              ".sc-ac6bc755-1",
              ".gs-c-timestamp",
              "time",
              ".date",
              ".timestamp"
            ];
            
            for (const selector of timeSelectors) {
              const timeElem = $(item).find(selector).first();
              if (timeElem.length > 0) {
                timestamp = timeElem.text().trim();
                break;
              }
            }
            
            // Combine all text and check for relevance with more relaxed criteria
            const articleText = `${title} ${summary}`.toLowerCase();
            
            // BBC is global, so we need to check if it mentions India
            const isIndiaRelated = 
              articleText.includes("india") || 
              articleText.includes("delhi") || 
              articleText.includes("indian") || 
              articleText.includes("modi") ||
              articleText.includes("mumbai") ||
              articleText.includes("bangalore") ||
              articleText.includes("bengaluru") ||
              articleText.includes("chennai") ||
              articleText.includes("kolkata") ||
              link.includes("india");
            
            const hasKeyword = NEWS_FILTER_KEYWORDS.some(keyword => 
              articleText.includes(keyword.toLowerCase())
            );
            
            // More relaxed criteria for BBC - either:
            // 1. If from India topic page, just check if defense-related
            // 2. Otherwise, check if India-related AND defense-related
            if ((url.includes("india") && (hasKeyword || 
                 articleText.includes("security") || 
                 articleText.includes("military") || 
                 articleText.includes("defence"))) || 
                (isIndiaRelated && (hasKeyword || 
                 articleText.includes("security") || 
                 articleText.includes("military") || 
                 articleText.includes("defence")))) {
                // Avoid duplicates
              if (!articles.some(a => a.url === link)) {                articles.push({
                  source: "BBC",
                  title,
                  summary,
                  url: link,
                  timestamp: "" // Don't show timestamp
                });
              }
            }
          }
        }
      } catch (error) {
        console.warn(`Error fetching BBC URL ${url}:`, error);
        continue;
      }
    }
    
    console.info(`BBC: Scraped ${articles.length} filtered articles`);
    return articles;
  } catch (error) {
    console.error(`Error scraping BBC:`, error);
    return [];
  }
}

/**
 * Scrape latest news from CNN India website
 */
async function scrapeCNN(): Promise<NewsArticle[]> {
  try {
    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    };
    
    const response = await axios.get("https://edition.cnn.com/world/india", { 
      headers, 
      timeout: 8000, // Reduce from 15000 to 8000ms
      maxRedirects: 5 
    });
    const html = response.data;
    const $ = cheerio.load(html);
    
    const articles: NewsArticle[] = [];
    
    // CNN uses various card layouts - try multiple selectors
    const selectors = [
      ".card", 
      ".container__item", 
      ".container_lead-plus-headlines__item", 
      "[data-zjs-component_name='card']"
    ];
      const newsItems: any[] = [];
    for (const selector of selectors) {
      $(selector).each(function(_: number, elem: any) {
        newsItems.push(elem);
        return true; // Return value to satisfy TypeScript
      });
    }
    
    // Process all articles
    for (const item of newsItems) {
      let titleElem = null;
      
      // Try different selectors for title elements
      for (const titleSelector of [".headline__text", ".container__headline-text", "h3", ".card__headline-text"]) {
        titleElem = $(item).find(titleSelector).first();
        if (titleElem.length > 0) break;
      }
      
      // Try to find a link element
      const linkElem = $(item).find("a").first();
      
      if (titleElem && titleElem.length > 0 && linkElem.length > 0 && linkElem.attr('href')) {
        const title = titleElem.text().trim();
        let link = linkElem.attr('href') || '';
        
        // Get summary if available
        let summary = "";
        const summaryElem = $(item).find(".container__copy, .container__description, .card__description").first();
        if (summaryElem.length > 0) {
          summary = summaryElem.text().trim();
        }
        
        // Make sure link is absolute URL
        if (!link.startsWith("http")) {
          if (link.startsWith("/")) {
            link = `https://edition.cnn.com${link}`;
          } else {
            link = `https://edition.cnn.com/${link}`;
          }
        }
        
        // Check if article contains any of the filter keywords with relaxed criteria
        const articleText = `${title} ${summary}`.toLowerCase();
        const isIndiaRelated = 
          articleText.includes("india") || 
          articleText.includes("delhi") || 
          articleText.includes("indian") || 
          articleText.includes("modi");
        
        const hasKeyword = NEWS_FILTER_KEYWORDS.some(keyword => 
          articleText.includes(keyword.toLowerCase())
        );
          // Since CNN India section is already India-focused, we can relax our criteria slightly
        if (isIndiaRelated && (hasKeyword || articleText.includes("security") || articleText.includes("military") || articleText.includes("defence"))) {
          articles.push({
            source: "CNN",
            title,
            summary,
            url: link,
            timestamp: "" // Hide timestamp as CNN doesn't show them
          });
        }
      }
    }
    
    console.info(`CNN: Scraped ${articles.length} filtered articles`);
    return articles;
  } catch (error) {
    console.error(`Error scraping CNN:`, error);
    return [];
  }
}

/**
 * Scrape latest news from WION India News section
 */
async function scrapeWION(): Promise<NewsArticle[]> {
  try {
    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9"
    };
    
    // Try multiple URLs for WION including more specific sections
    const urls = [
      "https://www.wionews.com/india-news",
      "https://www.wionews.com/south-asia",
      "https://www.wionews.com/topics/india-pakistan", // More specific topic
      "https://www.wionews.com/defence",  // Defense section
      "https://www.wionews.com/topics/defence", // Defense topics
      "https://www.wionews.com/search?query=defence", // Search for defense
      "https://www.wionews.com/topics/military" // Military topics
    ];
    
    const articles: NewsArticle[] = [];
    
    for (const url of urls) {
      try {
        console.info(`Trying to fetch WION URL: ${url}`);
        
        const response = await axios.get(url, { 
          headers, 
          timeout: 8000, // Reduce from 15000 to 8000ms
          maxRedirects: 5
        });
        
        const html = response.data;
        const $ = cheerio.load(html);
        
        // WION has multiple layout formats - try various selectors
        const selectors = [
          ".article-list",
          "article",
          ".news-card",
          ".card-container",
          ".list-item",
          ".story-card",
          ".news-item",
          ".article-wrapper",
          ".article-box"
        ];
          const newsItems: any[] = [];
        for (const selector of selectors) {
          $(selector).each((_, elem) => {
            newsItems.push(elem);
            return true;
            });
        }
        
        // If still no items, try fetching all links
        if (newsItems.length === 0) {
          $("a").each((_, elem) => {
            const href = $(elem).attr('href');
            if (href && href.includes('/india-news/') || 
                href && href.includes('/defence/') || 
                href && href.includes('/world/')) {
              newsItems.push(elem);
            }
          });
        }
        
        console.info(`Found ${newsItems.length} potential news items on ${url}`);
        
        // Process all articles
        for (const item of newsItems) {
          let title: string | null = null;
          let link: string | null = null;
          let summary: string = "";
          
          // If the item itself is a link
          if (item.name === 'a') {
            link = $(item).attr('href') || '';
            title = $(item).text().trim();
          } else {
            // For title, try various selectors
            const titleSelectors = [
              "h2", "h3", "h4", 
              ".title", ".headline", ".card-title",
              ".article-title", ".heading", 
              "a[data-title]" // WION sometimes uses data attributes
            ];
            
            for (const selector of titleSelectors) {
              const titleElem = $(item).find(selector).first();
              if (titleElem.length > 0) {
                title = titleElem.text().trim();
                // Check for data-title attribute
                if (titleElem.attr('data-title')) {
                  title = titleElem.attr('data-title') || title;
                }
                break;
              }
            }
            
            // For link - try to find a link element
            const linkSelectors = [
              "a", ".title a", "h3 a", "h2 a", 
              ".headline a", ".article-title a"
            ];
            
            for (const selector of linkSelectors) {
              const linkElem = $(item).find(selector).first();
              if (linkElem.length > 0 && linkElem.attr('href')) {
                link = linkElem.attr('href') || '';
                break;
              }
            }
          }
          
          if (!title || !link) continue;
          
          // Get summary if available
          const summarySelectors = [
            ".description", ".summary", 
            "p", ".excerpt", ".article-desc",
            ".card-text", ".article-summary"
          ];
          
          for (const selector of summarySelectors) {
            const summaryElem = $(item).find(selector).first();
            if (summaryElem.length > 0 && summaryElem.text() !== title) {
              summary = summaryElem.text().trim();
              break;
            }
          }            // Make sure link is absolute URL
          if (!link.startsWith("http")) {
            link = `https://www.wionews.com${link}`;
          }
          
          // Look for timestamp
          let timestamp = "";
          const timeSelectors = [
            ".article-info time", 
            ".date", 
            ".timeago", 
            ".post-date",
            ".timestamp",
            ".publish-time",
            ".article-date"
          ];
          
          for (const selector of timeSelectors) {
            const timeElem = $(item).find(selector).first();
            if (timeElem.length > 0) {
              // Try to get the datetime attribute first
              if (timeElem.attr('datetime')) {
                timestamp = timeElem.attr('datetime') || "";
              } else {
                timestamp = timeElem.text().trim();
              }
              break;
            }
          }
          
          // Check if article contains India or filter keywords
          const articleText = `${title} ${summary}`.toLowerCase();
          const isIndiaRelated = 
            articleText.includes("india") || 
            articleText.includes("delhi") || 
            articleText.includes("indian") || 
            articleText.includes("modi") ||
            link.includes("india");
          
          const hasKeyword = NEWS_FILTER_KEYWORDS.some(keyword => 
            articleText.includes(keyword.toLowerCase())
          );
          
          // Use more relaxed criteria for WION:
          // 1. If from defense section, include all India-related articles
          // 2. Otherwise check if India-related AND has defense keywords
          if ((url.includes("defence") && isIndiaRelated) ||
              (isIndiaRelated && (hasKeyword || 
               articleText.includes("security") || 
               articleText.includes("military") || 
               articleText.includes("defence")))) {
              if (!articles.some(a => a.url === link)) {              articles.push({
                source: "WION",
                title,
                summary,
                url: link,
                timestamp: "" // Don't show timestamp
              });
            }
          }
        }
      } catch (error) {
        console.warn(`Error fetching WION URL ${url}:`, error);
        continue;
      }
    }
    
    console.info(`WION: Scraped ${articles.length} filtered articles`);
    return articles;
  } catch (error) {
    console.error(`Error scraping WION:`, error);
    return [];
  }
}

/**
 * Scrape latest news from Reuters India website
 */
async function scrapeReuters(): Promise<NewsArticle[]> {
  try {
    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
      "Accept-Language": "en-US,en;q=0.9",
      "Referer": "https://www.reuters.com/"
    };
    
    // Reuters sections to get more articles
    const urls = [
      "https://www.reuters.com/world/india/",
      "https://www.reuters.com/world/asia-pacific/",
      "https://www.reuters.com/world/",
      "https://www.reuters.com/news/archive/india?view=page",
      "https://www.reuters.com/business/aerospace-defense/", // defense news
      "https://www.reuters.com/subjects/aerospace-and-defense" // defense news
    ];
    
    const articles: NewsArticle[] = [];
    
    for (const url of urls) {
      try {
        console.info(`Fetching Reuters URL: ${url}`);
        const response = await axios.get(url, { 
          headers, 
          timeout: 8000, // Reduced from 15000 to 8000
          maxRedirects: 5
        });
        
        const html = response.data;
        const $ = cheerio.load(html);
        
        // Reuters uses different layouts on different pages
        // multiple selectors for article containers
        const selectors = [
          "article", 
          ".media-story-card", 
          "[data-testid='story-card']", 
          ".story-card", 
          ".item-container",
          ".news-headline-list li",
          ".column1 .moduleBody li",
          ".story",
          ".article",
          ".story-content", // additional selectors
          ".article__content",
          ".ArticleBody",
          ".article-body",
          "[class*='article']",
          "[class*='story']"
        ];
        
        const newsItems: any[] = [];
        for (const selector of selectors) {
          $(selector).each(function(_, elem) {
            newsItems.push(elem);
            return true;
          });
        }
        
        // If regular selectors didn't find anything, try to get all links in the main content area
        if (newsItems.length === 0) {
          $("main a, #content a, .main-content a").each(function(_, elem) {
            const href = $(elem).attr('href');
            if (href && (href.includes('/article/') || href.includes('/world/'))) {
              newsItems.push(elem);
            }
            return true;
          });
        }
        
        console.info(`Found ${newsItems.length} potential news items on ${url}`);
        
        // Process all articles
        for (const item of newsItems) {
          let titleElem = null;
          let title = "";
          let link = "";
          
          // If the item itself is a link
          if (item.name === 'a') {
            link = $(item).attr('href') || '';
            title = $(item).text().trim();
          } else {
            // Try different selectors for title elements
            for (const titleSelector of [
              "h3", "h4", "h2", 
              ".media-story-card__heading__eqhp9", 
              ".story-card__title", 
              ".text__text__1FZLe", 
              ".item-heading",
              ".story-title",
              ".headline"
            ]) {
              titleElem = $(item).find(titleSelector).first();
              if (titleElem.length > 0) {
                title = titleElem.text().trim();
                break;
              }
            }
            
            // Find link element
            const linkElem = $(item).find("a").first();
            if (linkElem.length > 0 && linkElem.attr('href')) {
              link = linkElem.attr('href') || '';
            }
          }
          
          // Skip if title or link is empty
          if (!title || !link) continue;
          
          // Get summary if available
          let summary = "";
          const summarySelectors = [
            "p", 
            ".story-card__description", 
            ".item-summary",
            ".description",
            ".lede",
            ".article-body"
          ];
          
          for (const selector of summarySelectors) {
            const summaryElem = $(item).find(selector).first();
            if (summaryElem.length > 0 && summaryElem.text() !== title) {
              summary = summaryElem.text().trim();
              break;
            }
          }
            // Look for timestamp
          let timestamp = "";
          const timeSelectors = [
            "time[datetime]",
            "time",
            ".text__text__1FZLe.text__inherit-color__3208F",
            "time.text__text__1FZLe",
            ".date-line", 
            ".timestamp"
          ];
          
          for (const selector of timeSelectors) {
            const timeElem = $(item).find(selector).first();
            if (timeElem.length > 0) {
              // Try to get the datetime attribute first
              if (timeElem.attr('datetime')) {
                timestamp = timeElem.attr('datetime') || "";
              } else {
                timestamp = timeElem.text().trim();
              }
              break;
            }
          }
          
          // Make sure link is absolute URL
          if (!link.startsWith("http")) {
            link = `https://www.reuters.com${link}`;
          }
          
          // Use more relaxed filtering criteria to get more articles
          const articleText = `${title} ${summary}`.toLowerCase();
          
          // Two criteria:
          // 1. Article must mention India AND (have a defense keyword OR mention security/military), OR
          // 2. Article URL contains 'india' AND contains a defense-related word
          const isIndiaRelated = 
            articleText.includes("india") || 
            articleText.includes("delhi") || 
            articleText.includes("modi") ||
            articleText.includes("indian");
          
          const hasKeyword = NEWS_FILTER_KEYWORDS.some(keyword => 
            articleText.includes(keyword.toLowerCase())
          );
          
          // More relaxed criteria for Reuters
          if ((isIndiaRelated && (hasKeyword || 
               articleText.includes("security") || 
               articleText.includes("military") || 
               articleText.includes("defence") || 
               articleText.includes("defense"))) || 
              (link.toLowerCase().includes("india") && 
               (articleText.includes("military") || articleText.includes("defence") || 
                articleText.includes("security") || articleText.includes("defense")))) {
            
            // Avoid duplicates
            if (!articles.some(a => a.url === link)) {              articles.push({
                source: "REUTERS",
                title,
                summary,
                url: link,
                timestamp: "" // Don't show timestamp
              });
            }
          }
        }
      } catch (error) {
        console.warn(`Error fetching Reuters URL ${url}:`, error);
        continue;
      }
    }
    
    console.info(`Reuters: Scraped ${articles.length} filtered articles`);
    return articles;
  } catch (error) {
    console.error(`Error scraping Reuters:`, error);
    return [];
  }
}

/**
 * Scrape latest news from DD News National section
 */
async function scrapeDDNews(): Promise<NewsArticle[]> {
  try {
    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9"
    };
    
    // Multiple URLs for DD News - added more categories
    const urls = [
      "https://ddnews.gov.in/en/category/national/",
      "https://ddnews.gov.in/en",
      "https://ddnews.gov.in/en/category/defence", // defense specific
      "https://ddnews.gov.in/en/defence" // defense URL
    ];
    
    const articles: NewsArticle[] = [];
    
    for (const url of urls) {
      // Try 3 times with increasing timeout
      let success = false;
      
      for (let attempt = 0; attempt < 3 && !success; attempt++) {
        try {
          // Longer timeout as government sites can be slow
          const response = await axios.get(url, { 
            headers, 
            timeout: 8000 + (attempt * 2000), // Increase timeout with each retry
            maxRedirects: 5
          });
          
          const html = response.data;
          const $ = cheerio.load(html);
          
          // Try different selectors
          const selectors = [
            ".card-body", 
            "article", 
            ".news-item", 
            ".card", 
            ".view-content .views-row",
            ".item", // DD news selectors
            ".article",
            ".news-content" 
          ];
          
          const newsItems: any[] = [];
          for (const selector of selectors) {
            $(selector).each((_: number, elem: any) => {
              newsItems.push(elem);
              return true; // Return value to satisfy TypeScript
            });
          }
          
          // If standard selectors don't find anything, try a broader approach
          if (newsItems.length === 0) {
            $("a").each((_: number, elem: any) => {
              const href = $(elem).attr('href');
              if (href && $(elem).text().trim().length > 20) {
                newsItems.push(elem);
              }
              return true;
            });
          }
          
          console.info(`Found ${newsItems.length} potential items on DD News ${url}`);
          
          // Process all articles
          for (const item of newsItems) {
            let title: string | null = null;
            let link: string | null = null;
            
            // If item itself is a link
            if (item.name === 'a') {
              link = $(item).attr('href') || '';
              title = $(item).text().trim();
            } else {
              // Try different selectors for title
              const titleSelectors = ["h2.entry-title a", "h2.entry-title", "h5", "h3", "h4", ".card-title", ".field-content a", ".title", ".headline"];
              for (const selector of titleSelectors) {
                const titleElem = $(item).find(selector).first();
                if (titleElem.length > 0) {
                  title = titleElem.text().trim();
                  break;
                }
              }
              
              // Try to find a link element
              const linkElem = $(item).find("a").first();
              if (linkElem.length > 0 && linkElem.attr('href')) {
                link = linkElem.attr('href') || '';
              }
            }
            
            if (!title || !link) continue;
            
            // Get summary if available
            let summary = "";
            const summarySelectors = ["p.blogDisc", "p.excerpt", "p", ".card-text", ".field-content", ".summary", ".description"];
            for (const selector of summarySelectors) {
              const summaryElem = $(item).find(selector).first();
              if (summaryElem.length > 0 && summaryElem.text() !== title) {
                summary = summaryElem.text().trim();
                break;
              }
            }
            
            // Look for timestamp
            let timestamp = "";
            const timeSelectors = ["p.mb-0.colorPrimary", "p.date", "p.published", ".date", ".post-date", ".timestamp"];
            for (const selector of timeSelectors) {
              const timeElem = $(item).find(selector).first();
              if (timeElem.length > 0) {
                timestamp = timeElem.text().trim();
                break;
              }
            }
            
            // Make sure link is absolute URL
            if (!link.startsWith("http")) {
              if (link.startsWith("/")) {
                link = `https://ddnews.gov.in${link}`;
              } else {
                link = `https://ddnews.gov.in/${link}`;
              }
            }
            
            // Check if article contains any of the filter keywords
            const articleText = `${title} ${summary}`.toLowerCase();
            
            // Use very relaxed criteria for DD News since it's an Indian government source
            // If from defense section, include all articles
            // Otherwise, include if it has any defense-related keywords
            if (url.includes("defence") || 
                NEWS_FILTER_KEYWORDS.some(keyword => articleText.includes(keyword.toLowerCase())) ||
                articleText.includes("security") ||
                articleText.includes("military") ||
                articleText.includes("defence")) {
              // Check for duplicates
              if (!articles.some(a => a.url === link)) {
                articles.push({
                  source: "DD NEWS",
                  title,
                  summary,
                  url: link,
                  timestamp: timestamp || new Date().toISOString()
                });
              }
            }
          }
          
          success = true; // Break from retry loop if successful
        } catch (error) {
          console.warn(`Error fetching DD News URL ${url} (attempt ${attempt + 1}):`, error);
          
          if (attempt < 2) {
            // Wait for 2 seconds before retrying
            await new Promise(resolve => setTimeout(resolve, 2000));
          } else {
            console.error(`Failed to fetch DD News URL ${url} after 3 attempts.`);
          }
        }
      }
    }
    
    console.info(`DD News: Scraped ${articles.length} filtered articles`);
    return articles;
  } catch (error) {
    console.error(`Error scraping DD News:`, error);
    return [];
  }
}

/**
 * Scrape latest news from PIB (Press Information Bureau) website
 */
async function scrapePIB(): Promise<NewsArticle[]> {
  try {
    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9"
    };
    
    // Multiple URLs for PIB
    const urls = [
      "https://www.pib.gov.in/PMContents/PMContents.aspx?menuid=1&Lang=1&RegionId=3&reg=3",
      "https://pib.gov.in/indexd.aspx",
      "https://pib.gov.in/AllReleasem.aspx",
      "https://pib.gov.in/newsite/erelcontent.aspx?relid=0" // Releases page
    ];
    
    const articles: NewsArticle[] = [];
    
    for (const url of urls) {
      try {
        // Longer timeout as government sites can be slow
        const response = await axios.get(url, { 
          headers, 
          timeout: 8000,
          maxRedirects: 5
        });
        
        const html = response.data;
        const $ = cheerio.load(html);
        
        // Different selectors for different PIB page layouts
        const selectors = [
          ".content-area", 
          ".listing", 
          "#release",
          ".release",
          "ul.num",
          ".ReleaseCont",
          "a[href*='PressRelease']"
        ];
        
        const newsItems: any[] = [];
        for (const selector of selectors) {
          $(selector).each((_, elem) => {
            newsItems.push(elem);
            return true;
          });
        }
        
        // Process all articles
        for (const item of newsItems) {          // Try different selectors for the news elements
          const linkItems = $(item).find("a, .item, li a, a[href*='PressRelease']");
          
          for (let i = 0; i < linkItems.length; i++) {
            const linkElem = $(linkItems[i]);
            
            if (linkElem.attr('href')) {
              const title = linkElem.text().trim();
              let link = linkElem.attr('href') || '';
              
              // Skip empty titles, menu links, or non-press release links
              if (!title || title.length < 10) continue;
                // Look for timestamp
              let timestamp = "";
              // First try to find a timestamp near the link
              const linkParent = linkElem.parent();
              const timeSelectors = [
                ".publishdatesmall",
                "span.publishdatesmall",
                ".release-date", 
                ".date", 
                ".dateRelease", 
                "small",
                ".pDate",
                ".DateTime",
                ":contains('Date:')",
                ".releaseTime",
                ".timestamp"
              ];
              
              for (const selector of timeSelectors) {
                let timeElem = linkParent.find(selector).first();
                // Also look in siblings
                if (timeElem.length === 0) {
                  timeElem = linkElem.siblings(selector).first();
                }
                // Also check for next element
                if (timeElem.length === 0) {
                  timeElem = linkElem.next(selector).first();
                }
                // Also look in surrounding elements
                if (timeElem.length === 0) {
                  timeElem = linkParent.siblings().find(selector).first();
                }
                // Also check parent's siblings
                if (timeElem.length === 0) {
                  timeElem = linkParent.parent().siblings().find(selector).first();
                }
                
                if (timeElem.length > 0) {
                  timestamp = timeElem.text().trim();
                  // Clean up timestamp (PIB often includes "Date:" prefix)
                  timestamp = timestamp.replace(/^Date\s*:/i, "").trim();
                  timestamp = timestamp.replace(/^Posted on:\s*/i, "").trim();
                  break;
                }
              }
              
              // Make sure link is absolute URL
              if (!link.startsWith("http")) {
                if (link.startsWith("/")) {
                  link = `https://pib.gov.in${link}`;
                } else {
                  link = `https://pib.gov.in/${link}`;
                }
              }
              
              // Use more relaxed criteria for PIB - check if article contains any defense-related keywords
              // Also include all Ministry of Defence press releases
              const articleText = title.toLowerCase();
              if (articleText.includes("defence") || 
                  articleText.includes("ministry of defence") || 
                  NEWS_FILTER_KEYWORDS.some(keyword => articleText.includes(keyword.toLowerCase()))) {
                // Check for duplicates
                if (!articles.some(a => a.url === link)) {                  articles.push({
                    source: "PIB",
                    title,
                    summary: "", // PIB doesn't typically show summaries on the main page
                    url: link,
                    timestamp: "" // Don't show timestamp
                  });
                }
              }
            }
          }
        }
      } catch (error) {
        console.warn(`Error fetching PIB URL ${url}:`, error);
        continue;
      }
    }
    
    console.info(`PIB: Scraped ${articles.length} filtered articles`);
    return articles;
  } catch (error) {
    console.error(`Error scraping PIB:`, error);
    return [];
  }
}

/**
 * Scrape latest news from Firstpost India section
 */
async function scrapeFirstpost(): Promise<NewsArticle[]> {
  try {
    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9"
    };
    
    // Multiple URLs for Firstpost, focusing on broader categories and defense-specific topics
    const urlsToTry = [
      "https://www.firstpost.com/category/india", // India news
      "https://www.firstpost.com/category/world", // World might contain relevant articles
      "https://www.firstpost.com/category/politics", // Politics intersects with defense
      "https://www.firstpost.com/tag/defence", // Defense tag
      "https://www.firstpost.com/tag/defence-ministry", // Ministry tag
      "https://www.firstpost.com/india/defence", // Defense in India
      "https://www.firstpost.com/search/defence", // Search for defense
      "https://www.firstpost.com/search/military", // Search for military
      "https://www.firstpost.com/defence", // Defense section
      "https://www.firstpost.com/firstcricket/india-defence" // Alternative defense section
    ];
    
    const articles: NewsArticle[] = [];
    
    for (const url of urlsToTry) {
      try {
        console.info(`Trying to fetch Firstpost URL: ${url}`);
        
        const response = await axios.get(url, {
          headers,
          timeout: 50000,
          maxRedirects: 5
        });
        
        const html = response.data;
        const $ = cheerio.load(html);
        
        // Firstpost uses different layouts, try a variety of selectors for article containers
        const newsItems: any[] = [];
        
        $("article, .big-thumb, .main-story, [class*='story-'], div.article-list-item, .list-view-items li, .news-item, .card, .search-result-item").each((_, elem) => {
          newsItems.push(elem);
          return true;
        });
        
        if (newsItems.length === 0) {
          // Try to get all divs with links that might be articles
          $("div.article a, .story-wrap a, .news-listing a, .list-item a").each((_, elem) => {
            newsItems.push(elem);
            return true;
          });
        }
        
        // If still no items found, try a more general approach
        if (newsItems.length === 0) {
          $("a").each((_, elem) => {
            const href = $(elem).attr('href');
            const text = $(elem).text().trim();
            if (href && text && text.length > 20 && 
                (href.includes("/india/") || 
                 href.includes("/defence/") || 
                 href.includes("/world/"))) {
              newsItems.push(elem);
            }
            return true;
          });
        }
        
        console.info(`Found ${newsItems.length} potential news items on ${url}`);
        
        for (const item of newsItems) {
          let title: string | null = null;
          let link: string | null = null;
          let summary: string = "";
          
          // If item itself is a link
          if (item.name === 'a') {
            link = $(item).attr('href') || '';
            title = $(item).text().trim();
          } else {
            // Title selectors
            const titleElem = $(item).find("h3 a, h2 a, .title a, .story-title a, .headline a, .article-title a, .list-view-items-title a, .card-title a").first();
            if (titleElem.length > 0 && titleElem.text().trim()) {
              title = titleElem.text().trim();
              link = titleElem.attr('href') || '';
            }
            
            // If no element with 'a' found, check for standalone title and separate link
            if (!title || !link) {
              const titleElemAlternate = $(item).find("h3, h2, .title, .story-title, .headline, .article-title").first();
              const linkElem = $(item).find("a").first();
              
              if (titleElemAlternate.length > 0) {
                title = titleElemAlternate.text().trim();
              }
              
              if (linkElem.length > 0 && linkElem.attr('href')) {
                link = linkElem.attr('href') || '';
                // If no title, use link text as title
                if (!title && linkElem.text().trim()) {
                  title = linkElem.text().trim();
                }
              }
            }
          }
          
          if (!title || !link) continue;
            // Summary selectors
          const summaryElem = $(item).find("p, .summary, .excerpt, .description, .teaser, .article-excerpt, .list-view-items-summary, .card-text").first();
          if (summaryElem.length > 0 && summaryElem.text().trim() !== title) {
            summary = summaryElem.text().trim();
          }
          
          // Look for timestamp
          let timestamp = "";
          const timeSelectors = [
            ".article-date", 
            ".timestamp", 
            ".date", 
            ".time",
            "time",
            ".post-date",
            ".post-time",
            ".article-info time",
            ".publish-date"
          ];
          
          for (const selector of timeSelectors) {
            const timeElem = $(item).find(selector).first();
            if (timeElem.length > 0) {
              // Try to get datetime attribute first
              if (timeElem.attr('datetime')) {
                timestamp = timeElem.attr('datetime') || "";
              } else {
                timestamp = timeElem.text().trim();
              }
              break;
            }
          }
          
          // Make URL absolute if it's relative
          if (!link.startsWith("http")) {
            link = `https://www.firstpost.com${link}`;
          }
          
          const articleText = `${title} ${summary}`.toLowerCase();
          const isIndiaRelated = 
            articleText.includes("india") || 
            articleText.includes("delhi") || 
            articleText.includes("indian") || 
            articleText.includes("modi");
          
          const hasKeyword = NEWS_FILTER_KEYWORDS.some(keyword => 
            articleText.includes(keyword.toLowerCase())
          );
          
          // Very relaxed filtering - include if:
          // 1. Defense is in the URL, OR
          // 2. India-related with defense keywords, OR
          // 3. The URL is tagged with defense
          if (url.toLowerCase().includes("defence") || 
              url.toLowerCase().includes("military") || 
              link.toLowerCase().includes("defence") ||
              (isIndiaRelated && (hasKeyword || 
               articleText.includes("security") || 
               articleText.includes("military") || 
               articleText.includes("defence")))) {              if (!articles.some(a => a.url === link)) { // Avoid duplicates
                articles.push({
                  source: "FIRSTPOST",
                  title,
                  summary,
                  url: link,
                  timestamp: "" // Don't show timestamp
                });
              }
            }
          }
        }
      catch (error) {
        console.warn(`Error fetching Firstpost URL ${url}:`, error);
        continue;
      }
    }   
    console.info(`Firstpost: Scraped ${articles.length} filtered articles`);
    return articles;
  } catch (error) {
    console.error(`Error scraping Firstpost:`, error);
    return [];
  }
}