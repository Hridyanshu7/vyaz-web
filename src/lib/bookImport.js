const APIFY_BASE = 'https://api.apify.com/v2/acts'
const GOOGLE_BOOKS_API = 'https://www.googleapis.com/books/v1/volumes'

const FETCH_TIMEOUT = 6000
const APIFY_TIMEOUT = 60000

function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer))
}

function extractTitleFromSlug(pathname) {
  const slugMatch = pathname.match(/\/([^/]+)\/dp\//)
  if (!slugMatch) return null
  return slugMatch[1]
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim()
}

export function parseBookUrl(url) {
  try {
    const parsed = new URL(url.trim())
    const hostname = parsed.hostname.replace('www.', '')

    if (hostname.includes('amazon.')) {
      const dpMatch = parsed.pathname.match(/\/dp\/([A-Z0-9]{10})/i)
      const gpMatch = parsed.pathname.match(/\/gp\/product\/([A-Z0-9]{10})/i)
      const asin = dpMatch?.[1] || gpMatch?.[1]
      const titleFromSlug = extractTitleFromSlug(parsed.pathname)
      const cleanUrl = `${parsed.origin}${parsed.pathname.replace(/\/ref=.*$/, '')}`
      return { source: 'amazon', asin: asin || null, query: titleFromSlug, cleanUrl }
    }

    if (hostname.includes('goodreads.com')) {
      const bookMatch = parsed.pathname.match(/\/book\/show\/\d+[-.]?(.*)/)
      if (bookMatch) {
        const slug = bookMatch[1] || ''
        const query = slug.replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim()
        return { source: 'goodreads', asin: null, query, cleanUrl: url.split('?')[0] }
      }
    }

    return { source: 'unknown', asin: null, query: null, cleanUrl: url }
  } catch {
    return { source: 'invalid', asin: null, query: null, cleanUrl: null }
  }
}

// --- Apify: junglee/amazon-crawler ---

function getAttr(attributes, key) {
  if (!attributes) return null
  const attr = attributes.find((a) => a.key?.toLowerCase().includes(key.toLowerCase()))
  return attr?.value || null
}

function normalizeAmazonResult(item) {
  if (!item) return null

  const title = (item.title || '').replace(/\s*\(.*?\)\s*$/, '').trim()
  const author = item.author || item.brand || ''

  // extract book metadata from attributes
  const attrs = item.attributes || []
  const isbn13 = getAttr(attrs, 'ISBN-13')
  const isbn10 = getAttr(attrs, 'ISBN-10')
  const publisher = getAttr(attrs, 'Publisher')
  const pubDate = getAttr(attrs, 'Publication date')
  const language = getAttr(attrs, 'Language')
  const edition = getAttr(attrs, 'Edition')

  // page count from attributes or description
  let pageCount = null
  const printLength = getAttr(attrs, 'Print length') || getAttr(attrs, 'Pages')
  if (printLength) {
    const m = printLength.match(/(\d+)/)
    if (m) pageCount = parseInt(m[1], 10)
  }
  if (!pageCount) {
    const allText = [item.description, item.bookDescription, ...(item.features || [])].join(' ')
    const pageMatch = allText.match(/(\d+)\s*pages/i)
    if (pageMatch) pageCount = parseInt(pageMatch[1], 10)
  }

  // genre from breadcrumbs: "Books > Business & Economics > Economics"
  let genre = ''
  if (item.breadCrumbs) {
    const parts = item.breadCrumbs.split('>').map((s) => s.trim()).filter(Boolean)
    genre = parts.length > 1 ? parts[parts.length - 1] : parts[0] || ''
  }

  // best cover image: prefer high-res, fall back to thumbnail
  const coverImage = item.highResolutionImages?.[0] || item.thumbnailImage || ''

  // AI review summary
  const aiSummary = item.aiReviewsSummary?.text || ''
  const aiKeywords = (item.aiReviewsSummary?.keywords || []).map((k) => ({
    name: k.name,
    sentiment: k.sentiment,
    text: k.text,
    reviews: (k.partialReviews || []).slice(0, 3).map((r) => r.text),
  }))

  return {
    title,
    author,
    description: item.description || item.bookDescription || '',
    features: item.features || [],
    price: item.price?.value ? `${item.price.currency || '₹'}${item.price.value}` : null,
    listPrice: item.listPrice?.value ? `${item.listPrice.currency || '₹'}${item.listPrice.value}` : null,
    stars: item.stars || null,
    starsBreakdown: item.starsBreakdown || null,
    reviewsCount: item.reviewsCount || 0,
    thumbnailImage: coverImage,
    asin: item.asin || '',
    isbn13: isbn13?.replace(/-/g, '') || '',
    isbn10: isbn10 || '',
    url: item.url || '',
    pageCount,
    genre,
    publisher,
    pubDate,
    language,
    edition,
    inStock: item.inStock || false,
    inStockText: item.inStockText || '',
    delivery: item.delivery || '',
    fastestDelivery: item.fastestDelivery || '',
    bestsellerRanks: item.bestsellerRanks || [],
    aiSummary,
    aiKeywords,
  }
}

async function fetchFromAmazon(amazonUrl, onStatus) {
  const token = import.meta.env.VITE_APIFY_TOKEN
  if (!token) return null

  onStatus?.('Scraping Amazon...')

  try {
    const res = await fetchWithTimeout(
      `${APIFY_BASE}/junglee~amazon-crawler/run-sync-get-dataset-items?token=${token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryOrProductUrls: [{ url: amazonUrl }],
          maxItemsPerStartUrl: 1,
          scrapeProductDetails: true,
        }),
      },
      APIFY_TIMEOUT,
    )
    if (!res.ok) return null
    const data = await res.json()
    if (!Array.isArray(data) || data.length === 0) return null
    return normalizeAmazonResult(data[0])
  } catch {
    return null
  }
}

async function searchAmazon(query, onStatus) {
  const token = import.meta.env.VITE_APIFY_TOKEN
  if (!token) return null

  onStatus?.('Cross-checking Amazon...')

  try {
    const searchUrl = `https://www.amazon.com/s?k=${encodeURIComponent(query)}`
    const res = await fetchWithTimeout(
      `${APIFY_BASE}/junglee~amazon-crawler/run-sync-get-dataset-items?token=${token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryOrProductUrls: [{ url: searchUrl }],
          maxItemsPerStartUrl: 1,
          scrapeProductDetails: true,
        }),
      },
      APIFY_TIMEOUT,
    )
    if (!res.ok) return null
    const data = await res.json()
    if (!Array.isArray(data) || data.length === 0) return null
    return normalizeAmazonResult(data[0])
  } catch {
    return null
  }
}

// --- Apify: khadinakbar/goodreads-all-in-one-scraper ---

function normalizeGoodreadsResult(item) {
  if (!item) return null

  return {
    title: item.title || '',
    author: item.author || '',
    description: item.description || '',
    genres: item.genres || [],
    averageRating: item.averageRating || null,
    ratingsCount: item.ratingsCount || 0,
    ratingsDistribution: item.ratingsDistribution || null,
    pages: item.pages || null,
    isbn13: item.isbn13 || '',
    imageUrl: item.imageUrl || '',
    publishedAt: item.publishedAt || '',
    series: item.series || null,
    awards: item.awards || [],
    url: item.url || '',
    reviews: (item.reviews || []).slice(0, 5).map((r) => ({
      reviewer: r.reviewerName || 'Anonymous',
      rating: r.rating || 0,
      text: r.reviewText || '',
      date: r.reviewDate || '',
    })),
  }
}

async function fetchFromGoodreads(goodreadsUrl, onStatus) {
  const token = import.meta.env.VITE_APIFY_TOKEN
  if (!token) return null

  onStatus?.('Scraping Goodreads...')

  try {
    const res = await fetchWithTimeout(
      `${APIFY_BASE}/khadinakbar~goodreads-all-in-one-scraper/run-sync-get-dataset-items?token=${token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targets: [goodreadsUrl],
          resultsPerTarget: 1,
          scrapeReviews: true,
        }),
      },
      APIFY_TIMEOUT,
    )
    if (!res.ok) return null
    const data = await res.json()
    if (!Array.isArray(data) || data.length === 0) return null
    return normalizeGoodreadsResult(data[0])
  } catch {
    return null
  }
}

async function searchGoodreads(query, onStatus) {
  const token = import.meta.env.VITE_APIFY_TOKEN
  if (!token) return null

  onStatus?.('Cross-checking Goodreads...')

  try {
    const res = await fetchWithTimeout(
      `${APIFY_BASE}/khadinakbar~goodreads-all-in-one-scraper/run-sync-get-dataset-items?token=${token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targets: [query],
          resultsPerTarget: 1,
          scrapeReviews: true,
        }),
      },
      APIFY_TIMEOUT,
    )
    if (!res.ok) return null
    const data = await res.json()
    if (!Array.isArray(data) || data.length === 0) return null
    return normalizeGoodreadsResult(data[0])
  } catch {
    return null
  }
}

// --- Google Books fallback (free, no Apify needed) ---

async function fetchFromGoogleBooks(query, isbn) {
  try {
    const apiKey = import.meta.env.VITE_GOOGLE_BOOKS_API_KEY
    const keyParam = apiKey ? `&key=${apiKey}` : ''
    const searchParam = isbn ? `isbn:${isbn}` : query
    if (!searchParam) return null

    const res = await fetchWithTimeout(
      `${GOOGLE_BOOKS_API}?q=${encodeURIComponent(searchParam)}&maxResults=1${keyParam}`
    )
    if (!res.ok) return null
    const data = await res.json()
    const item = data.items?.[0]?.volumeInfo
    if (!item) return null

    const isbn13 = item.industryIdentifiers?.find((i) => i.type === 'ISBN_13')?.identifier
    const isbn10 = item.industryIdentifiers?.find((i) => i.type === 'ISBN_10')?.identifier

    return {
      title: item.title || '',
      author: item.authors?.join(', ') || '',
      description: item.description || '',
      page_count: item.pageCount || null,
      genre: item.categories?.[0] || '',
      isbn: isbn13 || isbn10 || '',
      cover_url: item.imageLinks?.thumbnail?.replace('http://', 'https://') || '',
    }
  } catch {
    return null
  }
}

// --- Build combined book profile ---

function buildCombinedProfile(amazon, goodreads, fallback) {
  const gr = goodreads || {}
  const az = amazon || {}
  const fb = fallback || {}

  return {
    title: gr.title || az.title || fb.title || '',
    author: gr.author || az.author || fb.author || '',
    isbn: gr.isbn13 || az.isbn13 || az.asin || fb.isbn || '',
    page_count: gr.pages || az.pageCount || fb.page_count || null,
    genre: gr.genres?.[0] || az.genre || fb.genre || '',
    description: gr.description || az.description || fb.description || '',
    cover_url: az.thumbnailImage || gr.imageUrl || fb.cover_url || '',
    publisher: az.publisher || '',
    pub_date: az.pubDate || gr.publishedAt || '',
    language: az.language || '',

    amazon: amazon,
    goodreads: goodreads,
  }
}

// --- Main import function ---

export async function importBookFromUrl(url, onStatus) {
  const parsed = parseBookUrl(url)

  if (parsed.source === 'invalid') {
    throw new Error('Invalid URL. Please paste an Amazon or Goodreads book link.')
  }

  if (!parsed.asin && !parsed.query && !parsed.cleanUrl) {
    throw new Error('Could not extract book info from this URL. Try a different link.')
  }

  let amazon = null
  let goodreads = null
  let googleFallback = null

  if (parsed.source === 'amazon') {
    // 1. Scrape Amazon
    amazon = await fetchFromAmazon(parsed.cleanUrl, onStatus)

    // 2. Cross-search Goodreads by title+author
    const crossQuery = amazon
      ? `${amazon.title} ${amazon.author}`.trim()
      : parsed.query
    if (crossQuery) {
      goodreads = await searchGoodreads(crossQuery, onStatus)
    }
  } else if (parsed.source === 'goodreads') {
    // 1. Scrape Goodreads
    goodreads = await fetchFromGoodreads(parsed.cleanUrl, onStatus)

    // 2. Cross-search Amazon by title+author
    const crossQuery = goodreads
      ? `${goodreads.title} ${goodreads.author}`.trim()
      : parsed.query
    if (crossQuery) {
      amazon = await searchAmazon(crossQuery, onStatus)
    }
  }

  // 3. If both Apify calls failed, try Google Books as last resort
  if (!amazon && !goodreads) {
    onStatus?.('Trying Google Books...')
    googleFallback = await fetchFromGoogleBooks(parsed.query, parsed.asin)
  }

  const combined = buildCombinedProfile(amazon, goodreads, googleFallback)

  // if we got absolutely nothing useful
  if (!combined.title && !parsed.query) {
    throw new Error('Book not found. Try pasting a different link or entering details manually.')
  }

  // fill title from URL slug if all sources missed it
  if (!combined.title && parsed.query) {
    combined.title = parsed.query
    combined._partial = true
  }

  return combined
}
