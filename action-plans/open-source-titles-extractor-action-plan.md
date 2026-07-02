You can build this catalogue almost entirely via existing APIs and Apify actors; below is a concrete per‑source plan plus reusable components you can plug into a Python/Apify pipeline.

## **Overall architecture**

* Treat each source as a separate “ingestion job” that produces a normalized table (book\_id, title, authors, language, license, country\_scope, publication\_year, download\_count/popularity\_metric, source).  
* Orchestrate these jobs with Apify (scheduled actors) or your own cron \+ Python, then merge into a central store (Postgres, DuckDB, or just Parquet) where you compute popularity and recency scores.  
* Use APIs wherever available (Project Gutenberg via Gutendex, Open Library for IA, OpenStax wrappers, etc.), and fall back to HTML scraping only when necessary.[gutendex](https://gutendex.com)[youtube](https://www.youtube.com/watch?v=reN_okp2Gq4)parse+1

---

## **Project Gutenberg / public‑domain classics**

## **Preferred: Gutendex API (or self‑hosted Gutendex)**

* Gutendex is a REST API over Project Gutenberg metadata that already sorts books by popularity (download\_count) and exposes rich metadata fields (subjects, authors, languages, copyright flag, formats).[gutendex](https://gutendex.com)  
* You can query `https://gutendex.com/books` with filters (search term, topic, language) and paginate through results; each response includes `results` array, `count`, and `next`/`previous` links.[gutendex](https://gutendex.com)

**Plan:**

1. Use Gutendex as your primary Gutenberg metadata source; iterate pages until `next` is null to get the full catalogue.[gutendex](https://gutendex.com)  
2. Persist fields: `id` (Gutenberg ID), `title`, `authors`, `languages`, `copyright`, `download_count`, `subjects`, `bookshelves`, `formats`.[gutendex](https://gutendex.com)  
3. Filter to English (`languages` contains `"en"`) and `copyright == False` to restrict to public‑domain English books from Gutenberg.[gutendex](https://gutendex.com)  
4. Popularity metric for your catalogue: Gutendex `download_count` \+ bookshelf/subject (e.g., “Best Books Ever,” “Popular Classic Fiction”) as qualitative features.[gutendex](https://gutendex.com)

**Self‑host / alternatives:**

* If you want full control or rate‑limit isolation, you can self‑host Gutendex (Django app that downloads Gutenberg catalog and serves the same API) or use the alternative open‑source “Gutenberg API” implementation.github+1  
* For bulk/offline data, Project Gutenberg also publishes machine‑readable catalog data and OPDS feeds you can mirror (HTTP/FTP/rsync, `search.opds` feed). This is useful if you want a once‑a‑day sync job rather than live API calls.gutenberg+1

## **Apify actor for Gutenberg**

* There is a dedicated Apify Actor “Gutenberg.org Scraper” that lets you search Gutenberg.org, filter by keyword and language, and extract ebook metadata.[apify](https://apify.com/epctex/gutenberg-scraper)  
* Use it when you want to enrich Gutendex data with page‑level fields (e.g., HTML descriptions, cover image, additional tags) or when you need specific keyword‑based subsets for experiments.[apify](https://apify.com/epctex/gutenberg-scraper)

**Plan with Apify:**

* Schedule the Gutenberg actor for a broad English search (or subject filters) and push its output directly into your dataset; join on Gutenberg ID with the Gutendex feed to add download stats and richer metadata.apify+1

---

## **Internet Archive / Open Library (for public-domain/open-licensed books)**

Internet Archive itself has complex APIs, but for “book‑like” resources, Open Library gives a simpler, mission‑aligned layer over IA.[youtube](https://www.youtube.com/watch?v=reN_okp2Gq4)[openlibrary](https://openlibrary.org/developers/api)

## **Open Library APIs**

* Open Library exposes multiple JSON APIs: Book Search, Work/Edition, Authors, Subjects, Search‑inside (full‑text), Covers, plus “Recent Changes” and legacy “Read” APIs.[openlibrary](https://openlibrary.org/developers/api)  
* These APIs are explicitly meant for open, public‑good discovery services, which makes them a good fit for your catalogue use case.[openlibrary](https://openlibrary.org/developers/api)

**Plan:**

1. Use the **Book Search API** (`/search.json?q=<query>&language=eng`) to find English books; filter down to works with IA “readable” editions and public‑domain or open licenses where metadata indicates that.[youtube](https://www.youtube.com/watch?v=reN_okp2Gq4)[openlibrary](https://openlibrary.org/developers/api)  
2. For each work, call **Work & Edition APIs** (`/works/{id}.json`, `/books/{edition}.json`) to pull structured metadata: titles, authors, publication dates, subjects, and IA identifiers (to bridge into actual IA items if needed).[youtube](https://www.youtube.com/watch?v=reN_okp2Gq4)[openlibrary](https://openlibrary.org/developers/api)  
3. For popularity, combine: number of IA loans/downloads (if accessible via IA), plus Open Library usage proxies (lists, ratings, etc.) and external signals you choose (not strictly in the API, but you can derive your own popularity score from the fields available).[openlibrary](https://openlibrary.org/developers/api)[youtube](https://www.youtube.com/watch?v=reN_okp2Gq4)  
4. Tag country\_scope based on publisher/location and rights information (e.g., books clearly flagged as public domain globally vs. region‑specific rights).

## **MCP / open-source helper**

* There’s an MCP server “mcp-open-library” that wraps Open Library APIs and has already been integrated in AI‑assistant contexts; even if you don’t use MCP directly, its code is a reference for calling Open Library cleanly.[openlibrary](https://openlibrary.org/developers/api)

---

## **DOAB (Directory of Open Access Books)**

DOAB aggregates peer‑reviewed open‑access books under OA licenses rather than public‑domain, but they’re highly relevant to your “open‑licensed” part.oaspa+1

**Plan (pragmatic):**

1. Start with DOAB’s public website (`doabooks.org`): identify listing pages or search endpoints you can crawl to retrieve book metadata (title, authors, license, publisher, subjects, language, publication year).open-access+1  
2. Treat DOAB as a “publisher‑level open access” source: license\_type will typically be CC BY/CC BY‑NC or similar rather than public domain; mark that explicitly in your schema.oaspa+1  
3. Because DOAB focuses on peer‑reviewed scholarly books, use a separate popularity lens (citations, library inclusion, DOAB listings) and keep their entries in a distinct “academic/OA” segment of your catalogue.open-access+1

Given your stack, you’d likely implement DOAB ingestion with a custom scraper: Node.js or Python crawlers using Crawlee or Scrapy, deployed as Apify actors, then normalized into your central schema.[github](https://github.com/apify/push-actor-action)

---

## **OpenStax (modern CC-licensed textbooks)**

OpenStax publishes high‑quality, CC‑licensed textbooks; they’re ideal for the “open-licensed” academic/professional slice of your catalogue.parse+1

## **API / wrappers**

* Parse.bot exposes a REST wrapper called “OpenStax API” with endpoints for listing textbooks and retrieving table of contents and learning outcomes, backed by public OpenStax CMS data (not an official OpenStax API but a maintained wrapper).[parse](https://parse.bot/marketplace/c4b2a76e-df44-4c90-862a-f2e6dd74ab32/openstax-org-api)  
* Apify has an “OpenStax Textbooks Scraper” actor that turns the public OpenStax CMS endpoint into a flat dataset of textbooks with fields like title, subject, edition, authors, license, ISBN, page count, language, and direct download links.[apify](https://apify.com/parseforge/openstax-textbooks-scraper)

**Plan:**

1. Use the **Apify OpenStax Textbooks Scraper** actor for bulk ingestion: schedule it to run daily/weekly, and export results as JSON/CSV straight into your warehouse.[apify](https://apify.com/parseforge/openstax-textbooks-scraper)  
2. Use the **Parse.bot OpenStax API** to augment with more granular information (TOC, learning outcomes) when you need to build advanced search or recommendation features; call `list_books` to get all live/new‑edition textbooks, filtered by subject where relevant.[parse](https://parse.bot/marketplace/c4b2a76e-df44-4c90-862a-f2e6dd74ab32/openstax-org-api)  
3. Normalize fields into your schema: license\_type (CC BY etc.), subject taxonomy, edition status, and link them to country\_scope “US/Global” because OpenStax textbooks are globally accessible in English.apify+1

---

## **Apify actors and open‑source building blocks**

You asked specifically about Apify actors and open-source APIs; here are the concrete ones you can reuse:

## **Apify actors**

* **Gutenberg.org Scraper** — extracts ebook data from Gutenberg.org with keyword and language filters; suited for metadata scraping and discovery, especially if you want fields not exposed via Gutendex.[apify](https://apify.com/epctex/gutenberg-scraper)  
* **OpenStax Textbooks Scraper** — pulls structured textbook records (title, subject, edition, license, ISBN, language, download links) from OpenStax CMS; can export directly to datasets (CSV/JSON) and integrate with schedulers, webhooks, and data warehouses.[apify](https://apify.com/parseforge/openstax-textbooks-scraper)

These actors run comfortably on Apify’s free tier for small previews and can be scheduled, integrated with Airtable/Slack/CRMs, or piped to BigQuery/Snowflake/Postgres out‑of‑the‑box.github+1

## **Open-source APIs / libraries**

* **Gutendex** — open-source Django web app that mirrors Gutenberg catalog and exposes an API; you can self‑host it or use the public instance.github+1  
* **Gutenberg API** (GitHub project) — alternative RESTful API over the full Gutenberg catalogue; useful if you prefer a different implementation or want to contribute.[github](https://github.com/GnikDroy/gutenberg_api)  
* **Open Library APIs** — official, open APIs for books, works, authors, subjects, covers, and full‑text search over many books tied to Internet Archive.[youtube](https://www.youtube.com/watch?v=reN_okp2Gq4)[openlibrary](https://openlibrary.org/developers/api)  
* **Apify’s Crawlee library** — open-source scraping/automation toolkit for Node.js/Python, designed to build actors and robust crawlers; good base if you want custom DOAB or niche‑site scrapers.[github](https://github.com/apify/push-actor-action)

---

## **Integration and ranking strategy**

Putting it all together:

1. **Ingestion layer:**  
   * Source A: Gutendex (Gutenberg) → public-domain literary classics.[gutendex](https://gutendex.com)  
   * Source B: Open Library/IA → public-domain and open books accessible via IA/Open Library.[youtube](https://www.youtube.com/watch?v=reN_okp2Gq4)[openlibrary](https://openlibrary.org/developers/api)  
   * Source C: DOAB → scholarly open-access books under OA licenses.oaspa+1  
   * Source D: OpenStax → CC-licensed textbooks (via Apify and/or Parse.bot).parse+1  
2. **Normalization:**  
   * Map each source to common fields: `title`, `authors`, `language`, `license_type`, `license_url`, `country_scope`, `original_pub_year`, `source`, `download_count/popularity_metric`, `subject_tags`.  
   * Infer `country_scope` (“India”, “US”, “Global”) from rights metadata and publisher location; for India, augment with region-specific lists like Indian public-domain authors (from separate research) and DLI/other local repositories.pothi+1  
3. **Popularity & recency scores:**  
   * Popularity: scale `download_count` (Gutendex, IA/Open Library where available) \+ presence in curated lists (e.g., “best public-domain books” guides) into a normalized score per book.[openlibrary](https://openlibrary.org/developers/api)[youtube](https://www.youtube.com/watch?v=reN_okp2Gq4)[gutendex](https://gutendex.com)  
   * Recency: use original publication year for literary works; for textbooks and OA books, use edition/publication year from OpenStax/DOAB metadata.open-access+2  
   * Slice by country and license: e.g., “Top 100 public-domain English books for US”, “Top 100 open‑licensed (CC BY/CC BY‑NC) English textbooks globally”, “India‑focused public-domain English/translated works.”  
4. **Delivery:**  
   * Pipe aggregated data into your existing spreadsheet/catalogue schema, or expose it as an internal API for your product; because everything is backed by open APIs and Apify actors, you can keep it updated with minimal maintenance overhead.github+3

If you want, I can next sketch a concrete Python \+ Apify project layout (folders, actor configs, ETL scripts) tailored to your workflow so you can go from zero to a unified “open books” catalogue quickly.

