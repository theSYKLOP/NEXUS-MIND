/* ==========================================================================
   NEXUS-MIND — OPEN SOURCE WEB SEARCH MODULE (js/web-search.js)
   Multi-Engine Live Search: Wikipedia API (CORS Native) + DuckDuckGo / SearXNG
   Zero API key required · Real-time context enrichment for local SLMs
   ========================================================================== */

/**
 * Clean HTML markup from search snippets
 */
function cleanSnippet(html = '') {
  if (!html) return '';
  return html
    .replace(/<span class="searchmatch">(.*?)<\/span>/gi, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Search Wikipedia via native CORS API (French & English fallback)
 * Ideal for historical, scientific, encyclopedic, philosophical, and cultural queries
 */
async function searchWikipedia(query, lang = 'fr', limit = 3) {
  try {
    const url = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=&format=json&origin=*&srlimit=${limit}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return [];

    const data = await res.json();
    const items = data?.query?.search || [];

    return items.map(item => ({
      title: item.title,
      snippet: cleanSnippet(item.snippet),
      url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/\s+/g, '_'))}`,
      source: `Wikipédia (${lang.toUpperCase()})`
    }));
  } catch (err) {
    console.warn(`Wikipedia (${lang}) search error:`, err.message);
    return [];
  }
}

/**
 * Fetch detailed lead summary from Wikipedia for the most relevant article
 */
async function fetchWikiExtract(title, lang = 'fr') {
  try {
    const url = `https://${lang}.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&titles=${encodeURIComponent(title)}&format=json&origin=*`;
    const res = await fetch(url, { signal: AbortSignal.timeout(3500) });
    if (!res.ok) return null;
    const data = await res.json();
    const pages = data?.query?.pages || {};
    const firstKey = Object.keys(pages)[0];
    if (firstKey && pages[firstKey]?.extract) {
      return pages[firstKey].extract.slice(0, 800);
    }
  } catch (e) {
    console.warn('Extract fetch failed:', e.message);
  }
  return null;
}

/**
 * DuckDuckGo Instant Answer / Topic Search API
 */
async function searchDuckDuckGo(query) {
  try {
    // Try DuckDuckGo Instant Answer API
    const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    // DuckDuckGo may require CORS proxy in browser context
    let res;
    try {
      res = await fetch(ddgUrl, { signal: AbortSignal.timeout(2500) });
    } catch {
      // Fallback via allorigins proxy
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(ddgUrl)}`;
      res = await fetch(proxyUrl, { signal: AbortSignal.timeout(3500) });
    }

    if (!res.ok) return [];
    const data = await res.json();
    const results = [];

    if (data.AbstractText) {
      results.push({
        title: data.Heading || query,
        snippet: data.AbstractText,
        url: data.AbstractURL || 'https://duckduckgo.com/?q=' + encodeURIComponent(query),
        source: 'DuckDuckGo Instant Answer'
      });
    }

    if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
      data.RelatedTopics.slice(0, 3).forEach(topic => {
        if (topic.Text && topic.FirstURL) {
          results.push({
            title: topic.Text.split(' - ')[0] || 'DuckDuckGo Source',
            snippet: topic.Text,
            url: topic.FirstURL,
            source: 'DuckDuckGo Web'
          });
        }
      });
    }

    return results;
  } catch (err) {
    console.warn('DuckDuckGo search error:', err.message);
    return [];
  }
}

/**
 * Execute multi-source open-source web search
 * @param {string} query - Search prompt
 * @param {object} options - Search configuration
 * @returns {Promise<Array>} List of search result objects
 */
export async function searchWeb(query, options = {}) {
  const cleanQuery = query
    .replace(/[?!.,;:()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleanQuery || cleanQuery.length < 2) return [];

  console.log(`%c[NEXUS WebSearch] Recherche en cours pour: "${cleanQuery}"`, 'color:#0ea5e9;font-weight:bold;');

  const results = [];

  // 1. Search French Wikipedia
  const frWiki = await searchWikipedia(cleanQuery, 'fr', 3);
  results.push(...frWiki);

  // If first French Wiki article is found, try to grab its lead extract for rich factual context
  if (frWiki.length > 0 && frWiki[0].title) {
    const extract = await fetchWikiExtract(frWiki[0].title, 'fr');
    if (extract && extract.length > frWiki[0].snippet.length) {
      frWiki[0].snippet = extract;
    }
  }

  // 2. If French Wiki yielded fewer than 2 items, search English Wikipedia
  if (results.length < 2) {
    const enWiki = await searchWikipedia(cleanQuery, 'en', 2);
    results.push(...enWiki);
  }

  // 3. Complement with DuckDuckGo Instant Answers
  const ddgResults = await searchDuckDuckGo(cleanQuery);
  results.push(...ddgResults);

  // Deduplicate by URL or title
  const seen = new Set();
  const deduped = [];
  for (const item of results) {
    const key = (item.title || '').toLowerCase().trim();
    if (!seen.has(key) && item.snippet && item.snippet.length > 20) {
      seen.add(key);
      deduped.push(item);
    }
    if (deduped.length >= 4) break;
  }

  console.log(`%c[NEXUS WebSearch] ${deduped.length} sources trouvées ✓`, 'color:#10b981;');
  return deduped;
}

/**
 * Format search results into prompt-ready context string
 */
export function formatWebContext(webResults = []) {
  if (!webResults || webResults.length === 0) return '';

  const formattedSources = webResults.map((r, i) => {
    return `[SOURCE WEB ${i + 1} — ${r.source} : ${r.title}]\nURL: ${r.url}\nCONTENU: ${r.snippet}`;
  }).join('\n\n');

  return `=== SOURCES WEB EN TEMPS RÉEL (NAVIGATEUR OPEN SOURCE) ===\n${formattedSources}\n=== FIN DES SOURCES WEB ===\nUtilise ces informations récentes et factuelles pour enrichir et compléter ta réponse.`;
}

/**
 * Heuristic to detect if a query benefits from web search
 */
export function shouldTriggerWebSearch(query) {
  if (!query) return false;
  const q = query.toLowerCase().trim();

  // Casual conversation & greetings: NEVER trigger web search
  const casualPhrases = [
    'bonjour', 'salut', 'coucou', 'hello', 'hey', 'bonsoir',
    'comment vas tu', 'comment vas-tu', 'comment ca va', 'comment ça va', 'ca va', 'ça va',
    'qui es tu', 'qui es-tu', 'qui tu es', 'merci', 'au revoir', 'a bientot',
    'aide moi', 'peux-tu', 'test', 'ok', 'd\'accord'
  ];
  const cleaned = q.replace(/[?!.,;:()]/g, '').trim();
  if (casualPhrases.some(c => cleaned === c || cleaned.startsWith(c + ' ') || cleaned.endsWith(' ' + c))) {
    return false;
  }

  // Typical interrogative, factual, historical, news, or scientific patterns
  const triggers = [
    'qui est', 'qui sont', 'qui a ', 'qui etait', 'c\'est quoi', 'qu\'est-ce que',
    'a quand', 'à quand', 'quand remonte', 'date de', 'origine de', 'creation de', 'création de',
    'adam et eve', 'adam et ève', 'histoire de', 'comment fonctionne',
    'actualité', 'dernier', 'dernière', 'version de', 'qui a inventé', 'qui a créé',
    'science', 'définition', 'découverte', 'recherche', 'wikipedia', 'web', 'internet',
    'météo', 'cours de', 'prix de', 'population', 'capitale', 'biographie', 'naissance'
  ];

  return triggers.some(t => q.includes(t));
}
