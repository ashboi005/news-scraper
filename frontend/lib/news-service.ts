import { NewsArticle } from './api';
import axios from 'axios';
import * as cheerio from 'cheerio';

// Cache settings
const CACHE_EXPIRY_SECONDS = 10 * 60; // 10 minutes
let newsCache: Record<string, NewsArticle[]> = {};
let lastUpdate: Date | null = null;

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
  const currentTime = new Date();
  
  // Check if we need to refresh the cache
  if (!lastUpdate || (currentTime.getTime() - lastUpdate.getTime()) > CACHE_EXPIRY_SECONDS * 1000) {
    await updateNewsCache();
  }
  
  // Filter by source if specified
  if (source) {
    const sourceUpper = source.toUpperCase();
    return {
      articles: newsCache[sourceUpper] || [],
      lastUpdated: lastUpdate ? lastUpdate.toISOString() : ''
    };
  }
  
  // Combine all news sources
  const allNews: NewsArticle[] = [];
  for (const sourceNews of Object.values(newsCache)) {
    allNews.push(...sourceNews);
  }
  
  return {
    articles: allNews,
    lastUpdated: lastUpdate ? lastUpdate.toISOString() : ''
  };
}

/**
 * Update the news cache with fresh data from all sources
 */
async function updateNewsCache() {
  try {
    // Run all scrapers in parallel
    const results = await Promise.all([
      scrapeBBC(),
      scrapeCNN(),
      scrapeReuters(),
      scrapeDDNews(),
      scrapePIB(),
      scrapePTI(),
      scrapeFirstpost(),
      scrapeWION()
    ]);
    
    // Process results and update cache
    const newCache: Record<string, NewsArticle[]> = {};
    
    newCache["BBC"] = results[0];
    newCache["CNN"] = results[1];
    newCache["REUTERS"] = results[2];
    newCache["DD NEWS"] = results[3];
    newCache["PIB"] = results[4];
    newCache["PTI"] = results[5];
    newCache["FIRSTPOST"] = results[6];
    newCache["WION"] = results[7];
    
    // Log a summary of fetched articles
    const summaryCounts: Record<string, number> = {};
    for (const [source, articles] of Object.entries(newCache)) {
      summaryCounts[source] = articles.length;
    }
    console.info("News scraping attempt summary - articles per source:", summaryCounts);
    
    // If no results were obtained, use dummy data
    if (Object.values(newCache).every(articles => articles.length === 0)) {
      console.warn("All scrapers failed. Using backup dummy data.");
      
      // Create dummy data - similar to the Python backend
      const timestamp = new Date().toISOString();
      
      newCache["BBC"] = [
        { source: "BBC", title: "Sample BBC News Article 1", url: "https://www.bbc.com/news/sample1", timestamp },
        { source: "BBC", title: "Sample BBC News Article 2", url: "https://www.bbc.com/news/sample2", timestamp }
      ];
      newCache["CNN"] = [
        { source: "CNN", title: "Sample CNN News Article", url: "https://www.cnn.com/news/sample", timestamp }
      ];
      newCache["REUTERS"] = [
        { source: "REUTERS", title: "Sample Reuters News Article", url: "https://www.reuters.com/news/sample", timestamp }
      ];
      newCache["DD NEWS"] = [
        { source: "DD NEWS", title: "Sample DD News Article", url: "https://ddnews.gov.in/news/sample", timestamp }
      ];
      newCache["FIRSTPOST"] = [
        { source: "FIRSTPOST", title: "Sample Firstpost News Article", url: "https://www.firstpost.com/news/sample", timestamp }
      ];
      newCache["WION"] = [
        { source: "WION", title: "Sample WION News Article", url: "https://www.wionews.com/news/sample", timestamp }
      ];
    }
    
    // Update the cache with the new data
    newsCache = newCache;
    
    // Update the timestamp
    lastUpdate = new Date();
  } catch (error) {
    console.error("Error updating news cache:", error);
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
          timeout: 15000,
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
              "[data-testid='card-text']", 
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
              if (!articles.some(a => a.url === link)) {
                articles.push({
                  source: "BBC",
                  title,
                  summary,
                  url: link,
                  timestamp: new Date().toISOString()
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
    
    const response = await axios.get("https://edition.cnn.com/world/india", { headers });
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
            timestamp: new Date().toISOString()
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
      // Try multiple Reuters sections to get more articles
    const urls = [
      "https://www.reuters.com/world/india/",
      "https://www.reuters.com/world/asia-pacific/",
      "https://www.reuters.com/world/",
      "https://www.reuters.com/news/archive/india?view=page",
      "https://www.reuters.com/business/aerospace-defense/", // Additional defense news
      "https://www.reuters.com/subjects/aerospace-and-defense" // More defense news
    ];
    
    const articles: NewsArticle[] = [];
    
    for (const url of urls) {
      try {
        console.info(`Fetching Reuters URL: ${url}`);
        const response = await axios.get(url, { 
          headers, 
          timeout: 15000,
          maxRedirects: 5
        });
          const html = response.data;
        const $ = cheerio.load(html);
        
        // Reuters uses different layouts on different pages
        // Try multiple selectors for article containers
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
          ".story-content", // Additional selectors
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
            
            // Try to find a link element
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
          
          // Make sure link is absolute URL
          if (!link.startsWith("http")) {
            link = `https://www.reuters.com${link}`;
          }
          
          // Apply more relaxed filtering criteria to get more articles
          const articleText = `${title} ${summary}`.toLowerCase();
          
          // Either:
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
            if (!articles.some(a => a.url === link)) {
              articles.push({
                source: "REUTERS",
                title,
                summary,
                url: link,
                timestamp: new Date().toISOString()
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
    
    // Try multiple URLs for DD News - added more categories
    const urls = [
      "https://ddnews.gov.in/en/category/national/",
      "https://ddnews.gov.in/en",
      "https://ddnews.gov.in/en/category/defence", // Defense specific
      "https://ddnews.gov.in/en/defence" // Alternate defense URL
    ];
    
    const articles: NewsArticle[] = [];
    
    for (const url of urls) {
      // Retry up to 3 times with increasing timeout
      let success = false;
      
      for (let attempt = 0; attempt < 3 && !success; attempt++) {
        try {
          // Use a longer timeout as government sites can be slow
          const response = await axios.get(url, { 
            headers, 
            timeout: 15000 + (attempt * 5000), // Increase timeout with each retry
            maxRedirects: 5
          });
          
          const html = response.data;
          const $ = cheerio.load(html);
          
          // Try various selectors
          const selectors = [
            ".card-body", 
            "article", 
            ".news-item", 
            ".card", 
            ".view-content .views-row",
            ".item", // Additional DD news selectors
            ".article",
            ".news-content" 
          ];
          
          const newsItems: any[] = [];
          for (const selector of selectors) {
            $(selector).each((_: number, elem: any) => {
            newsItems.push(elem);
            return true; // or just remove this return statement to return void
            });
          }
          
          // If standard selectors don't find anything, try a broader approach
          if (newsItems.length === 0) {
            $("a").each((_: number, elem: any) => {
              const href = $(elem).attr('href');
              if (href && $(elem).text().trim().length > 20) {
                newsItems.push(elem);
              }
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
              const titleSelectors = ["h5", "h3", "h4", ".card-title", ".field-content a", ".title", ".headline"];
              for (const selector of titleSelectors) {
                const titleElem = $(item).find(selector).first();
                if (titleElem.length > 0) {
                  title = titleElem.text().trim();
                  break;
                }
              }
              
              // For link
              const linkElem = $(item).find("a").first();
              if (linkElem.length > 0 && linkElem.attr('href')) {
                link = linkElem.attr('href') || '';
              }
            }
            
            if (!title || !link) continue;
            
            // Get summary if available
            let summary = "";
            const summarySelectors = ["p", ".card-text", ".field-content", ".summary", ".description"];
            for (const selector of summarySelectors) {
              const summaryElem = $(item).find(selector).first();
              if (summaryElem.length > 0 && summaryElem.text() !== title) {
                summary = summaryElem.text().trim();
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
                  timestamp: new Date().toISOString()
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
    
    // Try multiple URLs for PIB
    const urls = [
      "https://www.pib.gov.in/PMContents/PMContents.aspx?menuid=1&Lang=1&RegionId=3&reg=3",
      "https://pib.gov.in/indexd.aspx",
      "https://pib.gov.in/AllReleasem.aspx",
      "https://pib.gov.in/newsite/erelcontent.aspx?relid=0" // All releases page
    ];
    
    const articles: NewsArticle[] = [];
    
    for (const url of urls) {
      try {
        // Use a longer timeout as government sites can be slow
        const response = await axios.get(url, { 
          headers, 
          timeout: 15000,
          maxRedirects: 5
        });
        
        const html = response.data;
        const $ = cheerio.load(html);
        
        // Multiple selectors for different PIB page layouts
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
        for (const item of newsItems) {
          // Try different selectors for the news elements
          const linkItems = $(item).find("a, .item, li a, a[href*='PressRelease']");
          
          for (let i = 0; i < linkItems.length; i++) {
            const linkElem = $(linkItems[i]);
            
            if (linkElem.attr('href')) {
              const title = linkElem.text().trim();
              let link = linkElem.attr('href') || '';
              
              // Skip empty titles, menu links, or non-press release links
              if (!title || title.length < 10) continue;
              
              // Make sure link is absolute URL
              if (!link.startsWith("http")) {
                if (link.startsWith("/")) {
                  link = `https://pib.gov.in${link}`;
                } else {
                  link = `https://pib.gov.in/${link}`;
                }
              }
              
              // More relaxed criteria for PIB - check if article contains any defense-related keywords
              // Also include all Ministry of Defence press releases
              const articleText = title.toLowerCase();
              if (articleText.includes("defence") || 
                  articleText.includes("ministry of defence") || 
                  NEWS_FILTER_KEYWORDS.some(keyword => articleText.includes(keyword.toLowerCase()))) {
                // Check for duplicates
                if (!articles.some(a => a.url === link)) {
                  articles.push({
                    source: "PIB",
                    title,
                    summary: "", // PIB doesn't typically show summaries on the main page
                    url: link,
                    timestamp: new Date().toISOString()
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
 * Scrape latest news from PTI (Press Trust of India) website
 */
async function scrapePTI(): Promise<NewsArticle[]> {
  try {
    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9"
    };
    
    // PTI doesn't have a dedicated website, so we'll scrape from their content on partner sites
    // Added more sites and specific URLs for defense news
    const urlsToTry = [
      { url: "https://www.thehindu.com/news/national/", site: "The Hindu" },
      { url: "https://www.thehindu.com/news/national/defence/", site: "The Hindu Defense" },
      { url: "https://www.outlookindia.com/national", site: "Outlook India" },
      { url: "https://www.outlookindia.com/topic/defence", site: "Outlook Defense" },
      { url: "https://www.ndtv.com/india", site: "NDTV" },
      { url: "https://www.ndtv.com/topic/defence", site: "NDTV Defense" },
      { url: "https://www.ptinews.com/national-news", site: "PTI Official" },
      { url: "https://www.ptinews.com/defence", site: "PTI Defence" },
      { url: "https://timesofindia.indiatimes.com/india", site: "Times of India" },
      { url: "https://economictimes.indiatimes.com/news/defence", site: "ET Defense" }
    ];
    
    const articles: NewsArticle[] = [];
    
    for (const urlInfo of urlsToTry) {
      const url = urlInfo.url;
      const siteName = urlInfo.site;
      
      try {
        console.info(`Trying to fetch PTI from ${siteName} (${url})`);
        
        const response = await axios.get(url, { 
          headers, 
          timeout: 15000,
          maxRedirects: 5
        });
        
        const html = response.data;
        const $ = cheerio.load(html);
        
        // Selectors vary by site
        const newsItems: any[] = [];
        
        if (siteName.includes("The Hindu")) {
          $("div.story-card, .element.article-listing, .other-article, .archive-list li").each((_, elem) => {
            newsItems.push(elem);
            return true;
          });
        } else if (siteName.includes("Outlook")) {
          $("article.story-card, .news-story, .catPost-card, .photo_list_wrap, .listnews").each(function(_, elem) {
            newsItems.push(elem);
            return true;
          });
        } else if (siteName.includes("NDTV")) {
          $(".news_Itm, .lisingNews, .ins_storylist li, .featured_cont, .new_storylising li").each(function(_, elem) {
            newsItems.push(elem);
            return true;
          });
        } else if (siteName.includes("PTI")) {
          $(".container .col-md-8 .row.news-padd, .news-list article, .news-block, .newsListDiv .stry_lst, .newsListDiv .li").each(function(_, elem) {
            newsItems.push(elem);
            return true;
          });
        } else if (siteName.includes("Times of India") || siteName.includes("ET")) {
          $(".top-newslist li, .news-list li, .article-list .news_block, .dataList li, .story_list li").each(function(_, elem) {
            newsItems.push(elem);
            return true;
          });
        }
        
        // If none of the specific site selectors found anything, try some generic selectors
        if (newsItems.length === 0) {
          $("article, .story, .news-item, .article, div[class*='news'], div[class*='story']").each(function(_, elem) {
            newsItems.push(elem);
            return true;
          });
        }
        
        console.info(`Found ${newsItems.length} potential news items on ${siteName}`);
        
        for (const item of newsItems) {
          let title: string | null = null;
          let link: string | null = null;
          let summary: string = "";
          let isPtiStory: boolean = false;
          
          // If item is a link itself
          if (item.name === 'a') {
            link = $(item).attr('href') || '';
            title = $(item).text().trim();
          } else {
            // Common title selectors
            let titleSelectors = ["h3 a", "h2 a", ".title a", "a h3", "a h2", ".news_Itm-hd a", ".card-title a", ".lns_title", ".heading a", ".headline a"];
            if (siteName.includes("PTI")) {
              titleSelectors = ["h5 a", ".headline a", ".article-title a", ".stry_head a", ".stry_head_txt"];
            }
            
            // Try to find title and link
            for (const selector of titleSelectors) {
              const titleElem = $(item).find(selector).first();
              if (titleElem.length > 0) {
                title = titleElem.text().trim();
                link = titleElem.attr('href') || '';
                break;
              }
            }
            
            // If title or link not found with specific selectors, try a generic 'a'
            if (!title || !link) {
              const linkElem = $(item).find("a").first();
              if (linkElem.length > 0 && linkElem.attr('href')) {
                link = linkElem.attr('href') || '';
                // If still no title, use link text as title
                if (!title) {
                  title = linkElem.text().trim();
                }
              }
            }
          }
          
          if (!title || !link) continue;
          
          // Make link absolute
          if (siteName.includes("The Hindu") && !link.startsWith("http")) {
            link = `https://www.thehindu.com${link}`;
          } else if (siteName.includes("Outlook") && !link.startsWith("http")) {
            link = `https://www.outlookindia.com${link}`;
          } else if (siteName.includes("NDTV") && !link.startsWith("http")) {
            link = `https://www.ndtv.com${link}`;
          } else if (siteName.includes("PTI") && !link.startsWith("http")) {
            link = `https://www.ptinews.com${link}`;
          } else if (siteName.includes("Times of India") && !link.startsWith("http")) {
            link = `https://timesofindia.indiatimes.com${link}`;
          } else if (siteName.includes("ET") && !link.startsWith("http")) {
            link = `https://economictimes.indiatimes.com${link}`;
          }
          
          // Check for PTI attribution or if it's from PTI's own site
          const textContent = $(item).text().toLowerCase();
          if (textContent.includes("pti") || 
              textContent.includes("press trust of india") || 
              siteName.includes("PTI")) {
            isPtiStory = true;
          }
          
          // Get summary
          let summarySelectors = [".story-card-summary", ".card-text", ".news_Itm-cont", "p", ".synopsis", ".desc", ".summary"];
          if (siteName.includes("PTI")) {
            summarySelectors = [".news-content-p", ".excerpt", ".summary", ".stry_desc"];
          }
          
          for (const selector of summarySelectors) {
            const summaryElem = $(item).find(selector).first();
            if (summaryElem.length > 0 && summaryElem.text().trim() !== title) {
              summary = summaryElem.text().trim();
              break;
            }
          }
          
          const articleTextContent = `${title} ${summary}`.toLowerCase();
          
          // Check for relevance
          const isIndiaRelated = 
            articleTextContent.includes("india") || 
            articleTextContent.includes("delhi") || 
            articleTextContent.includes("indian") || 
            articleTextContent.includes("modi");
            
          const hasKeyword = NEWS_FILTER_KEYWORDS.some(keyword => 
            articleTextContent.includes(keyword.toLowerCase())
          );
          
          // More relaxed filtering:
          // 1. If it's a defense-specific page and a PTI story, include it
          // 2. If it's a PTI story that mentions India and defense keywords, include it
          if ((url.toLowerCase().includes("defence") && isPtiStory) ||
              (isPtiStory && (isIndiaRelated && (hasKeyword || 
               articleTextContent.includes("security") || 
               articleTextContent.includes("military") || 
               articleTextContent.includes("defence"))))) {
            
            if (!articles.some(a => a.url === link)) {
              articles.push({
                source: "PTI",
                title,
                summary,
                url: link,
                timestamp: new Date().toISOString()
              });
            }
          }
        }
      } catch (error) {
        console.warn(`Error fetching PTI from ${siteName} (${url}):`, error);
        continue;
      }
    }
    
    console.info(`PTI: Scraped ${articles.length} filtered articles from various sources`);
    return articles;
  } catch (error) {
    console.error(`Error scraping PTI:`, error);
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
    
    // Updated URLs for Firstpost, focusing on broader categories and defense-specific topics
    const urlsToTry = [
      "https://www.firstpost.com/category/india", // General India news
      "https://www.firstpost.com/category/world", // World news, might contain relevant articles
      "https://www.firstpost.com/category/politics", // Politics, often intersects with defense
      "https://www.firstpost.com/tag/defence", // Defense tag page
      "https://www.firstpost.com/tag/defence-ministry", // Defense ministry tag
      "https://www.firstpost.com/india/defence", // Defense section in India
      "https://www.firstpost.com/search/defence", // Search results for defense
      "https://www.firstpost.com/search/military", // Search results for military
      "https://www.firstpost.com/defence", // Direct defense section
      "https://www.firstpost.com/firstcricket/india-defence" // Alternative defense section
    ];
    
    const articles: NewsArticle[] = [];
    
    for (const url of urlsToTry) {
      try {
        console.info(`Trying to fetch Firstpost URL: ${url}`);
        
        const response = await axios.get(url, { 
          headers, 
          timeout: 20000, // Longer timeout to avoid ECONNRESET
          maxRedirects: 5
        });
        
        const html = response.data;
        const $ = cheerio.load(html);
        
        // Firstpost uses different layouts, try a variety of selectors for article containers
        const newsItems: any[] = [];
        
        $("article, .big-thumb, .main-story, [class*='story-'], div.article-list-item, .list-view-items li, .news-item, .card, .search-result-item").each((_, elem) => {
          newsItems.push(elem);
        });
        
        if (newsItems.length === 0) {
          // Try to get all divs with links that might be articles
          $("div.article a, .story-wrap a, .news-listing a, .list-item a").each((_, elem) => {
            newsItems.push(elem);
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
          });
        }
        
        console.info(`Found ${newsItems.length} potential news items on ${url}`);
        
        for (const item of newsItems) {
          let title: string | null = null;
          let link: string | null = null;
          let summary: string = "";
          
          // If the item itself is a link
          if (item.name === 'a') {
            link = $(item).attr('href') || '';
            title = $(item).text().trim();
          } else {
            // Expanded title selectors
            const titleElem = $(item).find("h3 a, h2 a, .title a, .story-title a, .headline a, .article-title a, .list-view-items-title a, .card-title a").first();
            if (titleElem.length > 0 && titleElem.text().trim()) {
              title = titleElem.text().trim();
              link = titleElem.attr('href') || '';
            }
            
            // If no title element with 'a' found, check for standalone title and separate link
            if (!title || !link) {
              const titleElemAlternate = $(item).find("h3, h2, .title, .story-title, .headline, .article-title").first();
              const linkElem = $(item).find("a").first();
              
              if (titleElemAlternate.length > 0) {
                title = titleElemAlternate.text().trim();
              }
              
              if (linkElem.length > 0 && linkElem.attr('href')) {
                link = linkElem.attr('href') || '';
                // If still no title, use link text as title
                if (!title && linkElem.text().trim()) {
                  title = linkElem.text().trim();
                }
              }
            }
          }
          
          if (!title || !link) continue;
          
          // Expanded summary selectors
          const summaryElem = $(item).find("p, .summary, .excerpt, .description, .teaser, .article-excerpt, .list-view-items-summary, .card-text").first();
          if (summaryElem.length > 0 && summaryElem.text().trim() !== title) {
            summary = summaryElem.text().trim();
          }
          
          // Make link absolute if it's relative
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
               articleText.includes("defence")))) {
            
            if (!articles.some(a => a.url === link)) { // Avoid duplicates
              articles.push({
                source: "FIRSTPOST",
                title,
                summary,
                url: link,
                timestamp: new Date().toISOString()
              });
            }
          }
        }
      } catch (error) {
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
          timeout: 15000,
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
        
        // If still no items, try to get them from the main articles div
        if (newsItems.length === 0) {
          const mainContent = $("#main-content, .main-content, #content").first();
          if (mainContent.length > 0) {
            // Get all links in the main content area
            mainContent.find("a").each((_, elem) => {
              const href = $(elem).attr('href');
              if (href && $(elem).text().trim().length > 15) {
                newsItems.push(elem);
              }
            });
          }
        }
        
        // If still nothing, try fetching all links
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
          }
          
          // Make sure link is absolute URL
          if (!link.startsWith("http")) {
            link = `https://www.wionews.com${link}`;
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
            
            if (!articles.some(a => a.url === link)) {
              articles.push({
                source: "WION",
                title,
                summary,
                url: link,
                timestamp: new Date().toISOString()
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
