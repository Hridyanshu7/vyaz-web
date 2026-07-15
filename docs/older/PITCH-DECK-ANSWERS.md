# Vyaz — Pitch Deck Answers

*For Accel, Elevation, Sequoia, Blume*

> **Status:** rewritten 2026-07-09 for the **AI-only product** (verbatim voice narration + whole-book Gist; no human narrators/bookings — see `docs/DECISIONS.md` D5). Every claim below is either (a) cited `[n]` to an external source in **Sources**, (b) traced to an internal doc (`docs/DECISIONS.md`, `docs/ARCHITECTURE.md`, `docs/pricing.md`, `docs/unit-economics.md`, `docs/voice-providers-comparison.md`), or (c) pulled live from the production database on 2026-07-09 and marked as such. Where I'm extrapolating rather than reporting a decided fact, it's marked **[my analysis]**.

---

## 1. What is the problem?

**The world's knowledge is locked in books that nobody finishes.**

- Purchased books routinely go unread or unfinished: a Kobo reading-data study found only ~60% of purchased e-books are ever opened at all [1]; a separate analysis of e-reader completion data found 57% of books that *are* started are never finished [2]. Reading itself is concentrated in a small group of heavy readers — Americans read a *mean* of ~8 books/year, but the *median* is just 2 [3].
- The people who need books most — professionals, founders, students — are the ones with the least time to read them.
- Existing alternatives are broken:
  - **Summaries (Blinkist, SparkNotes)** — strip the depth and, worse, strip the *author* — you get someone else's paraphrase of the ideas, not the ideas themselves. You can't ask a summary a question.
  - **Audiobooks (Audible)** — still 6-8 hours per book. Same time problem, different format. Audible is now also shipping **AI-narrated** audiobooks for publishers [16] — same static, non-interactive format, just cheaper to produce.
  - **AI "podcast" tools (Google NotebookLM)** — turn a source into a two-host AI conversation. Explicitly **not verbatim** (it summarizes/paraphrases), can produce **inaccuracies**, and — notably — you **can't interrupt the hosts** mid-conversation [17]. Fast, but it's a step *further* from the author's actual words, not closer.
  - **YouTube book reviews** — one person's monologue. No personalization, no interaction, no Q&A.
  - **Book clubs** — scheduling nightmare, half the members didn't finish, lowest-common-denominator discussion.

**The core pain:** There is no way to hear a book **in the author's own words**, interactively, in a time-efficient way. Every existing shortcut trades fidelity for speed. Vyaz's bet is that you don't have to.

---

## 2. Who are the users facing this problem?

**Primary: the Learner.** Positioned per `docs/pricing.md` and `docs/DECISIONS.md` D1 as a **premium AI study companion** — not a mass-market unlimited-audio product (the economics don't support that; see Q8).

- Students, aspirants, and working professionals in India, English-first, who read (or want to read) nonfiction — business, psychology, self-improvement, biography.
- Willingness to pay ~₹299–499/month [D1] — above the ₹99–199/mo mass-consumer ceiling, because that ceiling sits **below Vyaz's per-chapter cost** (~₹75/verbatim chapter — see Q8/unit-economics.md).
- They already pay for adjacent products: Blinkist (~$99.99/yr premium [5]), Audible, MasterClass — proof of willingness to pay for "faster access to a book's ideas," even though none of those products deliver the actual words.
- **TAM signal:** Blinkist alone has grown to 40M+ cumulative users (up from 23M in 2023) [4] on a summary product that strips the author's voice out entirely. That's tens of millions of people already paying for *less* fidelity than Vyaz aims to deliver.

**Secondary, non-monetizing but core to the thesis: the Author.** Vyaz's brand thesis (`docs/design-language.html` §1, "preserve the original, deliver it human") explicitly positions the author as the source of truth, credited and never paraphrased into anonymity. This isn't a revenue segment today, but it's a **positioning and eventual rights-partnership** stakeholder — see Q6 and the copyright flag in Q10.

*(The original draft of this doc had a "Narrator" supply-side persona — bibliophiles recruited to narrate books live. That persona described the human-narrator marketplace, which has been removed from the product entirely (D5). There is no supply-side user anymore; the "narration" is the AI voice agent.)*

---

## 3. What's the product? How does it solve the problem?

**Vyaz is an AI voice agent that reads a book chapter to you — word-for-word, in the author's own text — and answers your questions grounded in what it just read.**

### How it works today (shipped, per `docs/ARCHITECTURE.md`):
1. **Browse the catalog** — books enriched with real Amazon + Goodreads ratings, reviews, and genre tags side by side (`AddBook.jsx`/`BookDetail.jsx`).
2. **Sign in** — Google, LinkedIn, or email magic-link (Talk is auth-gated — action plan item #15-17, shipped).
3. **Talk** — tap Talk on any chapter. A Gemini Live voice session opens (full-duplex, ~320ms latency [voice-providers-comparison.md]) and reads the chapter **verbatim**. Its own remarks, check-ins, and answers to your questions are spoken too, but are structurally distinct — wrapped in `((...))` by the system prompt and rendered in a visibly different style on-screen (book text vs. agent aside), so you always know which words are the author's and which are the agent's (`DECISIONS.md` A4/A5).
4. **Interrupt anytime** — it's a live conversation, not a monologue. Ask "what does he mean by X" mid-chapter and it answers, grounded in the current chapter's text, then resumes.
5. **Track progress** — a single word-alignment pointer over the verbatim narration drives a real progress bar and per-section status (A6) — asides and Q&A don't fake progress.
6. **Whole-book Gist** — a faster, single-session AI summary of the entire book for a first pass, built and working (`mode: 'gist'`), currently gated behind a UI toggle pending Gemini billing (action item #36).

### What's *not* yet in the conversation (built, not wired):
The EPUB pipeline now extracts **structured content** — real tables, images, inline charts, sidebar/tip callouts (`DECISIONS.md` B7-B9) — stored per-chapter, ready for the agent to describe live via Gemini's multimodal input when a listener asks about a figure or table. This is built at the data layer; wiring it into an active voice session is explicitly the next phase, not yet shipped.

### Why this is better than alternatives:

| | Vyaz | Blinkist | Audible (human) | Audible AI [16] | NotebookLM [17] | ChatGPT |
|---|---|---|---|---|---|---|
| **Source fidelity** | Verbatim, author's exact words | Paraphrased summary | Verbatim (pre-recorded) | Verbatim (TTS of full text) | Paraphrased/summarized | Whatever the model recalls — not grounded in the actual text |
| **Interactive Q&A** | Yes — interrupt & ask anytime, grounded in the chapter | No | No | No | No — can't interrupt the hosts | Yes, but ungrounded (hallucination risk) |
| **Time to value** | ~30 min/chapter (verbatim) or a single Gist session | 15 min | 6-8 hrs | 6-8 hrs | ~10 min, auto-generated | Seconds, but unreliable |
| **Author credited/present** | Always — it's their text, spoken | Diluted into a summary | Yes | Yes (nominally) | No — synthesized "hosts" | No |

**The key differentiator:** every other row on this table trades away either the author's actual words *or* the ability to ask a question. Vyaz is the only one that keeps both.

---

## 4. Why does this problem need to be solved now? Using this product?

### Why now:

**1. The knowledge economy demands it.** The professional world runs on books — "what are you reading?" is a status signal — but the gap between books people claim to have read and books they've actually understood is widening. *(Framing point, not independently sourced.)*

**2. The audience for narrated book content is proven and large.** #BookTok has surpassed 370B+ views (up from ~182B in Sept 2023 — roughly doubled in two years) [7] and directly drove an estimated 59M print book sales and $760M+ in U.S. revenue in 2024 [8]. Goodreads has 150M+ registered members [6]. This isn't proof people want *AI* narration specifically — it's proof the appetite for engaging, discussed, narrated book content is already massive and growing.

**3. Remote/on-demand consumption of "someone talking to you" is normalized.** Cambly (on-demand video access to a person, ~$250M ARR at a ~$750M estimated valuation as of 2024 [9], though these are third-party estimates — Cambly's own disclosures are inconsistent about even having raised outside capital [9]) proved people will pay for on-demand, conversational access. Vyaz applies the same "on-demand, conversational" expectation to books — just with an AI voice instead of a human tutor.

**4. AI narration just became trustworthy enough to bet on — and the AI-slop backlash makes fidelity the differentiator, not a compromise.** 2025 was the year both Google (NotebookLM Audio Overviews, Sept 2024 launch [17]) and Amazon (Audible AI narration, May 2025 [16]) shipped mainstream AI-narrated content at scale — proving the *technology* works and *distribution* wants it. But both ship the failure mode Vyaz is explicitly built against: NotebookLM paraphrases and can produce **inaccuracies** [17] (one outlet's coverage of Audible's move was literally titled *"Even Audiobooks Aren't Safe From AI Slop"* [16]). **Vyaz's bet: verbatim narration + visible author-attribution is the credible answer to "AI slop," not a workaround for AI's limitations.** This is already the product's brand thesis (`docs/design-language.html` §1) — the timing argument is that the market only just started asking this question, in 2025, at scale.

### Why this product:
- **Not a summarizer, not a generic chatbot** — the product is structurally committed to verbatim delivery (`DECISIONS.md` A4 — this was tried both ways; free-form/paraphrased narration was tried first and reverted specifically because it broke progress tracking *and* the fidelity promise).
- **The economics are real, not hand-waved** — Gemini Live is the cheapest all-in unified voice provider available today (~$0.02-0.03/min effective, vs. $0.05-0.31/min for OpenAI Realtime, ElevenLabs, Vapi, Retell — see `docs/voice-providers-comparison.md`), which is *why* verbatim-length (~30 min/chapter) sessions are viable at all rather than a cost fantasy.
- **The interaction model is proven at scale by a comparable** — Cambly's "pay for on-demand access to a person's time" ARR (~$250M [9]) validates that people pay for live, conversational, on-demand experiences over passive content, at the price points this category can sustain.

---

## 5. Why can you solve this problem? What unfair advantages do you have?

### 1. The name *is* the thesis, and it fits better now than before the pivot
Vyaz → **Vyasa**, the sage who narrated the Mahabharata: a learned voice recites the text, explains it, and takes questions — India's 3,000-year-old format for oral knowledge transfer. Pre-pivot, this was a metaphor for human narrators. Post-pivot, it's literal: **an AI voice, reciting the actual text, answering questions** *is* the Vyasa pattern. No Western AI-reading competitor (NotebookLM, Audible AI) is built around this framing — both are explicitly "AI hosts" or "AI narration," not "faithful reciter."

### 2. A real, shipped data moat — not an aspiration
Every Talk/Gist session is durably recorded end-to-end: full transcript + a mandatory 1-5★ rating (`voice_sessions`, `DECISIONS.md` A15), and every individual agent response can get a thumbs up/down with an optional free-text reason (A16). That's structured, per-message quality-feedback data on narration performance — not analytics *about* books (which Goodreads/Amazon already have), but analytics about **how well AI narration itself lands**, session by session, response by response. This does not exist anywhere else because no one else has shipped verbatim conversational narration at this granularity of feedback.

### 3. Cross-platform book intelligence (shipped)
Every catalog title merges Amazon + Goodreads ratings, reviews, and metadata side by side (`AddBook.jsx`/`BookDetail.jsx`) — a richer single book-profile page than either source alone. Discovery moat, already live.

### 4. Execution moat on a genuinely hard technical problem
Verbatim delivery + real-time progress tracking + visibly distinguishing "book text" from "AI aside," all inside a live, interruptible voice session, took multiple reversed attempts to get right (`DECISIONS.md` A4/A5/A6: free-form narration → discussion mode → back to verbatim; text-match classification → role-based → prompt-emitted markers). Long chapters (~30 min) exceed a single Gemini Live WebSocket's ~10-15 min lifetime — solved with session resumption + auto-reconnect that preserves the in-progress word-alignment pointer (A11). This is not a wrapper around an API; it's a set of hard-won, specific engineering decisions a fast-follower would have to rediscover.

### 5. India-first cost and language fit
Gemini Live natively covers ~10 Indian languages with auto-detect and mid-conversation switching [voice-providers-comparison.md] — a real, already-built expansion lever, not a roadmap promise. Combined with India's ~135M English-proficient population [10] and position as the 3rd-largest English-language publishing market globally [10], the initial wedge (English business/nonfiction) has a natural, already-supported expansion path into Indian-language narration without a new vendor.

*(Dropped from the original draft: narrator-supply advantage and marketplace network effects — both described the removed two-sided marketplace and don't apply to a single-sided AI product.)*

---

## 6. How do you solve the cold start problem? What's your GTM plan?

The cold-start shape changed with the pivot: **there is no supply side to recruit anymore.** The two real cold-start problems now are (a) **catalog breadth** and (b) **proving narration quality** before spending on acquisition — not narrator recruitment.

### Phase 0: Prove quality on a small, real catalog (now, ongoing)
- 7 published / 21 total books in the catalog as of 2026-07-09 (live DB), spanning the target wedge: *Zero to One*, *Thinking, Fast and Slow*, *The Art of Thinking Clearly*, *What I Learned About Investing from Darwin*, *Romancing the Balance Sheet*, *The Book of Elon*, plus a public-domain classic (*Robinson Crusoe*) — see Q13 for full traction detail.
- **This phase is not done** — 20 internal test sessions average 2.89★/5 (live DB, 2026-07-09; see the honest caveat in Q13). Do not scale acquisition spend before this number is healthy on a larger sample.

### Phase 1: Catalog + rights (replaces narrator recruitment)
- EPUB ingestion pipeline is built and working (Admin panel: EPUB → Generate → Split → structured blocks — `DECISIONS.md` B2/B7). The bottleneck is now **which books you have the right to narrate aloud, in full, via AI** — this is a genuine open question the current docs don't address (flagged prominently in Q10) and needs a rights/licensing answer before wide catalog expansion, not just an ingestion pipeline.
- Public-domain classics (like *Robinson Crusoe*, already in the catalog) are a safe, zero-rights-risk way to prove the narration experience while the licensing question for in-copyright business bestsellers gets resolved.

### Phase 2: Demand generation (the original plan's channels mostly still apply)
- **LinkedIn** (highest ROI for the target segment: founders, PMs, MBA students) — "I let an AI read me Zero to One, word for word, and I could ask it anything" is a stronger, more demo-able hook than the original narrator-recruitment pitch.
- **Reddit**: r/books, r/Entrepreneur, r/suggestmeabook.
- **WhatsApp/Telegram**: MBA groups, startup founder groups, reading clubs (India-specific distribution).
- **Product demo > testimonial** — unlike the P2P version (which needed social proof of *narrators*), the AI product's differentiator (verbatim + interruptible) is best shown, not described. A 60-second clip of interrupting mid-chapter and getting a grounded answer is the whole pitch.

### Phase 3: Own the wedge
- **Wedge unchanged: business/startup nonfiction for Indian professionals** — concentrated demand, high WTP, and the current catalog already fits it.
- Don't expand genres or geographies until verbatim quality + the rights question are both solid.

### GTM channels by priority:
1. LinkedIn organic (demo-driven, not testimonial-driven)
2. Reddit communities (book + professional subs)
3. WhatsApp/Telegram groups (India-specific)
4. Rights/licensing conversations with publishers — a **new**, non-obvious GTM dependency the pre-pivot plan never needed (see Q10)
5. Product Hunt (after quality bar is met — not before, given the current 2.89★ internal average)

---

## Additional Questions Investors Will Ask

### 7. What's the market size?

**TAM:** Global book publishing market, ~$136-151B depending on methodology (~$140B is a fair midpoint) [11], plus the global online education/e-learning market, which varies widely by source/definition from ~$185B to ~$349B (~$350B at the high end) [12]. Vyaz sits at the intersection — narrated book content as a learning product.

**SAM — rebuilt bottom-up rather than proxied off Blinkist [my analysis, since the original SAM math ("30M Blinkist users × $100/yr") proxied off a competitor's *summary* product, which is a weaker analogy now that Vyaz is positioned on fidelity, not speed]:**
- India's English-proficient population: ~135M [10].
- Target segment (`docs/pricing.md`): premium learners — students, aspirants, professionals with WTP ~₹299-499/mo. Even a conservative 2-3% of the English-proficient population fitting this profile (~2.7-4M people) at an average ~₹300/mo blended ARPU is a **~₹970 Cr-1,460 Cr (~$115-175M) SAM in India alone** — before any non-English-market or B2B expansion. This is a rough, top-down sanity check, not a validated bottom-up model; a real SAM needs actual conversion-funnel data, which the product doesn't have yet (see Q13).

**SOM (Year 1):** The original "$10M addressable (100K users × $100/yr)" figure was an unsourced founder assumption in the original draft — flagging rather than re-deriving, since Year-1 SOM should be built from the actual funnel once there's real conversion data (there currently isn't — see Q13).

**Comparable exits/valuations (corrected from the original draft, which had several wrong or unverifiable figures):**
- Blinkist was acquired by Go1 in **2023** (not 2022, as the original draft said) for an **undisclosed price** — third-party estimates cluster around ~$100M, with one source citing ~€200M; there is no confirmed $160M figure [13].
- Cambly is **not** a confirmed unicorn — best third-party estimate is a **~$750M valuation** on **~$250M ARR** (2024, GetLatka — not audited or company-disclosed) [9]. The original draft's "$1B+" claim is unsupported.
- Audible was acquired by Amazon for **~$300M** in 2008 (SEC-confirmed, $11.50/share) [14] and now generates an estimated **~$1.01B** in revenue (2024 third-party estimate — Amazon doesn't break this out) [15].

**A market-sizing angle the original draft didn't have:** the *cost side* of this market is now well-documented (`docs/unit-economics.md`, `docs/voice-providers-comparison.md`) — Gemini Live at ~$0.02-0.03/min all-in is meaningfully cheaper than every comparable voice-AI provider (OpenAI Realtime, ElevenLabs, Vapi, Retell all run $0.05-0.31/min), which is a real, defensible reason Vyaz's unit economics can work in India specifically where competitors' cost structures wouldn't.

### 8. What's the business model?

**Current documented recommendation (`docs/pricing.md`): Freemium 3-tier + verbatim credits**, positioned as a premium AI study companion (not "unlimited audio" — that's structurally impossible at LLM-generation cost, unlike Spotify/Audible's near-zero marginal cost [`pricing.md` §1]):

| Tier | Price/mo | Original allowance | Cost basis |
|---|---|---|---|
| Free | ₹0 | 2-3 concise chapters/mo | ~₹34-51/mo cost |
| Learner | ₹199 | ~10 concise chapters/mo | ~₹170/mo cost, ~15% margin |
| Scholar | ₹449 | ~22 concise chapters/mo | ~₹375/mo cost, ~16-25% margin |
| Verbatim à la carte | ₹99/ch or ₹399/5-pack | full-read premium chapters | ~₹75/ch cost, ~24% margin |

**⚠️ This table is stale in one critical way, and I want to flag it clearly rather than present it as current [my analysis]:** it was built around a **concise/discussion mode** costing ~₹17/chapter as the everyday default, with verbatim (~₹75/ch) as the premium upsell. On 2026-07-07, concise mode was **decided against entirely** — it broke progress tracking and the black/grey verbatim-vs-aside classification (`DECISIONS.md` D2 update, A4). **Every chapter in the product today is a ~₹75 verbatim chapter.** That means the table above, if read literally, implies a Learner tier costing ~₹750/mo to deliver (10 chapters × ₹75) against ₹199 of revenue — a ~₹550/mo loss per subscriber, not the ~15% margin the table claims.

**What this means the pricing model actually needs (not yet decided — flagging for the deck, not answering it):**
- Either the chapter allowances shrink roughly 4-5x (a ₹199 tier affording ~2-3 verbatim chapters/mo, not 10), or
- The model moves away from a "chapters/mo" framing entirely toward a pure credits/à la carte structure (verbatim credits only, no bundled allowance illusion), or
- The ₹17→₹10/ch cost-reduction lever `pricing.md` calls out gets revived in a different form — e.g. a genuinely shorter Gist-only tier (the whole-book Gist mode already exists and is far cheaper per listen than a per-chapter verbatim read) priced as the "everyday" tier instead of a doomed concise-narration mode.
- **This is the single most important open item before this section can go in front of investors as-is** — the current headline pricing table no longer matches the current cost structure.

**Longer-term (unchanged from original draft, still directionally reasonable):** B2B corporate L&D licensing (companies pay for employee access), verified/premium narration tiers, potential author-royalty or rights-revenue-share arrangements once the copyright question (Q10) has an answer — this last one wasn't in the original draft at all and only became relevant post-pivot, since the product's revenue now runs directly through reading someone else's copyrighted text aloud rather than through a human narrator's own commentary.

### 9. What's the competitive landscape?

The competitive frame changed entirely post-pivot: it's no longer "human vs. AI," it's **"verbatim + interactive" vs. everyone else's "paraphrased and/or static."**

| Competitor | What they do | Why Vyaz wins |
|---|---|---|
| **Blinkist** | Text/audio *summaries* — paraphrased, not the author's words | No interaction, no author fidelity. Being commoditized by free AI summarization (ChatGPT can do the same paraphrase for $0). |
| **Audible (human-narrated)** | Full, verbatim audiobooks | Verbatim like Vyaz, but 6-8 hrs, no interaction, and priced/produced for passive listening, not study. |
| **Audible AI narration** [16] | AI-voiced, verbatim TTS of full books, for publishers | Verbatim like Vyaz, but **zero interactivity** — it's TTS, not a conversation. Coverage of this launch was literally titled *"Even Audiobooks Aren't Safe From AI Slop"* [16] — the exact positioning gap Vyaz is built to fill. |
| **Google NotebookLM (Audio Overviews)** [17] | Two AI "hosts" discuss/paraphrase your source material | Explicitly not verbatim, can produce inaccuracies, and — critically — **you can't interrupt the hosts** [17]. Vyaz is interruptible by design (A8). |
| **ChatGPT / generic LLMs** | Free-form Q&A "about" a book from training data | Not grounded in the actual text — hallucination risk on both facts and quotes. Vyaz's Q&A is grounded in the literal chapter text being read (A7). |
| **Headway** | Visual/text book summaries | Same category as Blinkist — no verbatim source, no live Q&A. |
| **MasterClass** | Pre-recorded celebrity courses | Not book-specific, no interaction, no verbatim source material at all. |

**Vyaz's moat, restated for the current product:** every named competitor picks one of "verbatim" or "interactive" — none does both, and two of them (NotebookLM, Audible AI) are large, well-funded companies that shipped *paraphrased or static* AI narration in the last 12 months, not verbatim-and-interactive. That gap is the whole thesis, and it's getting more relevant, not less, as "AI slop" becomes a mainstream concern investors themselves will likely raise.

### 10. What are the key risks?

The original risk table (narrator quality, disintermediation, narrator supply-demand) is fully obsolete post-pivot. The real risks today:

| Risk | Detail | Mitigation / status |
|---|---|---|
| **Copyright/rights to narrate in full, aloud, via AI** | The product reads full, in-copyright books verbatim — this is a materially different legal question than a human reading their own commentary, or a 15-minute fair-use-adjacent summary (Blinkist's model). **No document in this repo currently addresses licensing/rights for the books in the catalog** (which today includes *Zero to One*, *Thinking, Fast and Slow*, and other actively-in-print, commercially published titles). This is the single biggest unaddressed risk found in this review — needs a real answer (author/publisher licensing deals, fair-use legal opinion, or a public-domain-only catalog strategy) before scaling. |
| **Gemini concurrency ceiling** | The Developer API allows only ~3 concurrent Live sessions per key — the 4th simultaneous listener is rejected outright. Migrating to Vertex AI (1,000/project) is scoped but **not started** (action plan item #34) [`unit-economics.md`, `DECISIONS.md` A3]. |
| **Vendor/model instability** | Preview Gemini model IDs have already been deprecated/renamed server-side without notice once (`gemini-2.0-flash-live-001` was shut down; a Vertex-only model ID cost a debugging cycle — `DECISIONS.md` A3/A9). "Worked yesterday, no code change" is a known failure mode here, not hypothetical. |
| **Unit economics vs. India WTP** | Verbatim narration costs ~₹75/chapter; the mass-consumer price ceiling in India for "unlimited audio" is ₹99-199/mo total [`pricing.md` §1] — below the cost of two chapters. The pricing model has to solve this (see the open gap flagged in Q8) or the target segment must stay narrow (premium learners only). |
| **Free-tier burn** | Even the (now-stale) free tier design implied real audio cost, not near-zero marginal cost — `pricing.md` modeled ~₹4.2L/mo burn at 10,000 free users before any conversion, in a scenario that's now understated given concise mode was dropped. |
| **Early-stage security gaps** | A known, unfixed RLS gap lets anyone (even logged out) read every `book_requests` row — low-harm (no PII beyond a user ID) but unresolved (action plan item #37). Illustrative of pre-launch security hygiene still catching up. |
| **No real traction yet** | 2 total users, 20 internal test sessions, 2.89★/5 average rating as of 2026-07-09 (live DB — see Q13). This is pre-launch dogfooding, not market validation — treat every market-size/SAM number above as a top-down estimate, not something proven by usage data yet. |

### 11. What are you asking for?

The original ask (**₹3-5 Cr / $350-600K seed**) is carried forward as the founder's own figure — I have no basis to independently validate or revise a fundraising target, and it's not derivable from the technical docs. **The use-of-funds breakdown, however, was 100% shaped around the removed narrator marketplace and needs a full rebuild** [my analysis, replacing the original line items]:

| Category | Original (obsolete) | Rebuilt for the AI-only product |
|---|---|---|
| Engineering | Narrator availability system, admin panel, payments, mobile app | Vertex AI migration (concurrency scale, action item #34), RAG/retrieval for cross-chapter Q&A (parked, A7), wiring structured content (images/tables) into live sessions (B7 Phase 3, not built), cost-reduction R&D on verbatim generation, mobile app |
| Supply/content | Narrator onboarding, verification, incentive programs | **Rights/licensing acquisition** for in-copyright titles (the risk flagged in Q10) + continued EPUB catalog ingestion |
| Demand generation | LinkedIn/book club campaigns aimed at narrator+consumer both | Same channels, consumer-only now (no narrator-side spend) |
| Operations | Legal, compliance, infrastructure | Same, **plus** a real legal budget line for the copyright question — this wasn't a cost center pre-pivot (human narrators own their own words; AI reading someone else's book verbatim is a different exposure) |

**Milestone for next round** (original draft): 1,000 completed sessions, 50 active narrators, 500 MAU, 30% 2nd-session retention. The "50 active narrators" line is obsolete; a rebuilt milestone set should be session volume + retention + **resolved rights status for the core catalog**, not narrator counts.

### 12. What's the 3-year vision?

Rebuilt around AI session economics rather than narrator/session-count projections that no longer map to the product [my analysis — the original Year 1/2/3 narrator counts (50/500/5,000 narrators) are not translatable to a single-sided AI product, so this is a fresh structure, not a citation-patch of the original numbers]:

- **Year 1:** Resolve the rights/licensing question for the core business-nonfiction catalog (Q10's flagged risk); get verbatim session quality solidly above the current 2.89★ internal baseline (Q13) on a real, external user base; prove the India premium-learner segment converts at a rate that makes the pricing model (once rebuilt — Q8) work. Migrate off the ~3-concurrent-session Developer API ceiling onto Vertex AI ahead of any real acquisition push.
- **Year 2:** Expand language coverage using Gemini Live's existing ~10-Indian-language support [`voice-providers-comparison.md`] — a real, low-marginal-cost expansion lever most competitors (NotebookLM, Audible AI, both English-first) don't have in the same unified-model way. Expand genre coverage beyond business/startup nonfiction. Pilot B2B/corporate L&D licensing.
- **Year 3:** Category position: the verbatim, interactive alternative to both AI-paraphrase tools (NotebookLM-style) and static AI-narrated audio (Audible-AI-style) — a category neither large incumbent is building for, since both optimized for speed/scale over fidelity. RAG-based cross-chapter and cross-book Q&A (parked item A7) live, removing the current single-chapter context limitation.

*(Deliberately not restating specific session/MRR targets from the original draft — those numbers were unsourced founder projections built around a narrator-count model that no longer applies; a credible 3-year forecast now needs to start from the rebuilt Q8 pricing model and real Year-1 conversion data, neither of which exists yet.)*

### 13. What traction do you have?

**Pulled directly from the production database, 2026-07-09 — reported honestly, not spun:**

- **Catalog:** 21 books total, **7 published**, spanning the target wedge — *Zero to One* (Peter Thiel), *Thinking, Fast and Slow* (Daniel Kahneman), *The Art of Thinking Clearly* (Rolf Dobelli), *What I Learned About Investing from Darwin* (Pulak Prasad), *Romancing the Balance Sheet* (Anil Lamba), *The Book of Elon* (Eric Jorgenson), plus one public-domain classic (*Robinson Crusoe*).
- **Sessions:** 20 total voice sessions, all on the Gemini Live provider, all between 2026-07-07 and 2026-07-09.
- **Ratings:** 19 of 20 sessions rated, **average 2.89 out of 5.** I'm reporting this as-is rather than omitting it — **this is not an investor-ready number and shouldn't be presented as traction until it improves.** Context that matters: this window is essentially the first few days after the durable session-history + rating feature shipped (`DECISIONS.md` A15, 2026-07-07) — these are very likely internal/founder test sessions during active development, not external users, and several reliability fixes (transcript fidelity, session resumption) landed in this same window (A10/A11, 2026-07-06). The honest framing for a deck: *"we instrumented real session-quality telemetry from day one; current internal testing surfaced a quality bar we're actively closing before external launch"* — not *"we have a 2.89★ product."*
- **Users:** 2 total registered profiles (live DB) — consistent with `DECISIONS.md` D5's note that only 2 users existed at pivot time. **There is no external user traction yet.**
- **What *is* real and worth presenting:** the product is fully built and dogfooded end-to-end (auth → catalog → verbatim Talk with live Q&A → Gist → rated session history), session-resumption survives the ~15-min WebSocket limit for full 30-min chapters (A11), and per-message thumbs-up/down feedback capture is live (A16) — meaning the *instrumentation* to prove quality at scale already exists, even though the *data* proving it doesn't yet.
- Prod is live at **www.vyaz.in** (the original draft's `vyaz.vercel.app` is stale).
- The old GCal-integration line from the original draft is gone — that was P2P booking infrastructure, removed in the pivot (D5).

**Bottom line for the deck: this is a pre-launch, fully-built product with real instrumentation and an honest quality gap still being closed — not yet a traction story. Don't present the session/rating numbers as growth metrics; present the shipped reliability/instrumentation work as evidence of execution speed instead.**

### 14. What's the team?

*(Unchanged — this needs the founder's actual background, which isn't derivable from the codebase or docs.)*
- Why are YOU the person to build this?
- What's your relationship with books/reading?
- Any relevant startup/product/tech experience?
- Who else is on the team or planned to be?

One framing suggestion tied to the rest of this document: the Vyasa thesis (Q5 #1) is strongest if the founder's own "why" connects personally to *fidelity* — why the author's actual words mattered enough to build a whole product around preserving them, rather than a generic "I love reading" narrative.

---

## Sources

1. Kobo reading-data study — only ~60% of purchased e-books are ever opened. Cited via [WordsRated, "American Reading Habits Study"](https://wordsrated.com/american-reading-habits-study/).
2. Jellybooks / Margaret A. Johnson — 57% of purchased books are never read through to the end. [margaretajohnson.com](https://www.margaretajohnson.com/news/2017/9/25/57-of-books-purchased-are-never-read-through-to-the-end).
3. Average vs. median books read per year (US) — mean ~8/year, median ~2/year, skewed by a small group of heavy readers. [Gallup, "Americans Reading Fewer Books Than in Past"](https://news.gallup.com/poll/388541/americans-reading-fewer-books-past.aspx); corroborating figures via [WordsRated](https://wordsrated.com/how-many-books-does-the-average-person-read/).
4. Blinkist user count — 41M users worldwide as of Dec 2025, up from 23-26M in 2023 (self-reported). [Blinkist — About](https://www.blinkist.com/en/about); [Blinkist Magazine, "Year in Blinks 2023"](https://www.blinkist.com/magazine/posts/year-in-blinks).
5. Blinkist Premium pricing — ~$99.99/year standard annual plan. [Blinkist — Pricing](https://www.blinkist.com/pricing).
6. Goodreads — 150M+ registered members (2024). [Goodreads — Wikipedia](https://en.wikipedia.org/wiki/Goodreads); [ExpandedRamblings, "Goodreads Statistics 2026"](https://expandedramblings.com/index.php/goodreads-facts-and-statistics/).
7. BookTok — #BookTok has surpassed 370B+ views (up from ~182B in Sept 2023) and 50M+ videos / 34.6M posts. [WordsRated, "BookTok Statistics"](https://wordsrated.com/booktok-statistics/).
8. BookTok commercial impact — an estimated 59M print book sales and $760M+ in U.S. revenue tied to TikTok-discovered titles in 2024. [Forbes / TikTok BrandVoice, "The Power Of BookTok"](https://www.forbes.com/sites/tiktok/2025/04/21/the-power-of-booktok-why-tiktoks-book-community-is-driving-a-new-era-in-publishing/).
9. Cambly — ~$250M ARR at a ~$750M valuation (2024 estimate, not audited/company-disclosed). [GetLatka, "Cambly Revenue 2024"](https://getlatka.com/companies/cambly.com). Note: sources conflict on whether Cambly has raised outside VC funding at all — treat all Cambly financial figures as directional, not confirmed.
10. India English-language market — ~135M English-proficient speakers (~10% of population); India is the 3rd-largest English-language publishing market globally; ~65% of India's population is under 35. [The History of English, "How Many People in India Speak English"](https://www.thehistoryofenglish.com/how-many-people-in-india-speak-english); [Bookmandee, "How India Reads"](https://bookmandee.com/blog/how-india-reads-insights/).
11. Global book publishing market size — estimates range ~$136-151B for 2024 depending on methodology. [Spherical Insights, "Book Publishing Market"](https://www.sphericalinsights.com/reports/book-publishing-market); [Fact.MR, "Book Publishing Market"](https://www.factmr.com/report/book-publishing-market).
12. Global e-learning/online-education market size — estimates range ~$185-349B for 2024 depending on source/definition; $349.34B per the high-end estimate. [Roots Analysis, "E-Learning Market Size & Share Report"](https://www.rootsanalysis.com/e-learning-market); range corroborated via [Straits Research](https://straitsresearch.com/report/e-learning-market).
13. Go1 acquires Blinkist — announced May 2023 (not 2022); price undisclosed, third-party estimates ~$100M (some sources cite ~€200M). [TechCrunch, "Go1 snaps up speed reading app Blinkist"](https://techcrunch.com/2023/05/08/go1-snaps-up-speed-reading-app-blinkist-to-expand-in-enterprise-learning/).
14. Amazon acquires Audible — ~$300M, $11.50/share, announced Jan 2008, closed Mar 2008. [SEC EDGAR, Audible Inc. Form 8-K](https://www.sec.gov/Archives/edgar/data/0001077926/000119312508061014/dex991.htm).
15. Audible estimated revenue — ~$1.01B (market-share-based third-party estimate; Amazon does not disclose Audible's revenue separately). [Appfigures, "Audible's First Billion"](https://appfigures.com/resources/insights/20240927?f=3).
16. Audible AI-narrated audiobooks — announced May 2025, partnering with select publishers, 100+ AI voices, English/French/Spanish/Italian. [TechCrunch, "Audible is expanding its AI-narrated audiobook library"](https://techcrunch.com/2025/05/13/audible-is-expanding-its-ai-narrated-audiobook-library/); commentary: [Futurism, "Even Audiobooks Aren't Safe From AI Slop"](https://futurism.com/audible-announces-ai-narrators).
17. Google NotebookLM Audio Overviews — launched Sept 2024; two AI hosts discuss/paraphrase source material; explicitly not verbatim, can produce inaccuracies, hosts cannot be interrupted mid-conversation (as of the source's writing). [Google Blog, "NotebookLM now lets you listen to a conversation about your sources"](https://blog.google/technology/ai/notebooklm-audio-overviews/).

**Internal sources** (not web-cited, referenced inline by filename): `docs/DECISIONS.md`, `docs/ARCHITECTURE.md`, `docs/pricing.md`, `docs/unit-economics.md`, `docs/voice-providers-comparison.md`, `docs/design-language.html`, `action-plans/tender-conjuring-flurry.md`, and the production Supabase database (queried directly, 2026-07-09).
