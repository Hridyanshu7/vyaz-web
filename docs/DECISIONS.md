# Vyaz — Decision Log (ADRs)

_Append-only record of the significant decisions and pivots, with the **why** behind them. Newest sections grouped by theme. Format per entry: **Decision · Status · Why · Alternatives considered.** Last updated: 2026-07-06._

> **How to use this:** this is the "don't lose the why" record. When a decision changes, add a new entry that supersedes the old one (don't silently edit history). Companion docs: [`ARCHITECTURE.md`](ARCHITECTURE.md) (current system), [`pricing.md`](pricing.md), [`unit-economics.md`](unit-economics.md), [`voice-providers-comparison.md`](voice-providers-comparison.md).

---

## A. Voice / AI narration (the core product arc)

### A1. Voice provider evolution: Cartesia Line → custom pipeline → Gemini Live
- **Status:** Active — **Gemini Live** is the primary; Cartesia + custom pipeline remain selectable.
- **Why:** Started on **Cartesia Line** (managed voice agent, code-based, Claude Haiku) as the benchmark — great latency (Sonic TTS 40–90ms) but **ran out of credits**. Built a **custom STT→LLM→TTS pipeline** on Gemini as a fallback, but chaining three sequential API calls gave **high latency** and the browser-TTS fallback sounded robotic. Moved to **Gemini Live** (full-duplex WebSocket, one connection does STT+LLM+TTS) — cheapest all-in (~$0.02–0.03/min), low latency (~320ms), natively multilingual (incl. ~10 Indian languages), and already on our key.
- **Alternatives:** Sarvam, Smallest.ai (parked — API keys / sales-gated); ElevenLabs, Vapi, Retell, LiveKit, Pipecat, OpenAI Realtime (see [voice-providers-comparison.md](voice-providers-comparison.md)).

### A2. Provider switcher = one global combo
- **Status:** Active. `platform_settings.voice_provider ∈ { cartesia, pipeline, gemini_live }`, chosen in Admin → Agents; the Talk button routes to the matching modal.
- **Why:** Simpler than per-book/per-user config; lets us A/B providers platform-wide.

### A3. Gemini Live model + Developer API vs Vertex
- **Status:** Active — default **`gemini-3.1-flash-live-preview`**.
- **Why:** `gemini-2.0-flash-live-001` was **shut down**; `gemini-2.5-flash-native-audio-preview` is more natural but **flaky** (mid-turn drops). `gemini-live-2.5-flash-native-audio` is a **Vertex-only** ID — the Developer API rejects it (this cost us a debugging cycle). **Key constraint:** Developer API allows **~3 concurrent sessions/key**; **Vertex AI = 1,000/project** — Vertex is the path to scale. Preview models change server-side without notice (bit us once — see A9).

### A4. Verbatim narration, NOT discussion mode
- **Status:** Active (verbatim). **This reversed an earlier decision** — important.
- **History:** First built free-form narration → the model **paraphrased/summarized**, which broke progress tracking + classification. Tried **discussion mode** (orchestrated section-by-section) → but discussion fundamentally can't support verbatim progress/classification, and it compromised Q&A context. **Reverted to verbatim**: the agent reads the section text word-for-word.
- **Why:** Progress tracking and black/grey classification both **require verbatim delivery** to work. "Discussion tonality" + "accurate tracking" are in direct tension; verbatim won.
- **Trade-off accepted:** longer sessions + higher audio-output cost vs. summaries.

### A5. `((...))` prompt-driven aside marking (classification)
- **Status:** Active.
- **Decision:** The system prompt instructs the model to wrap **everything that is not the book's exact words** (its own remarks, questions, check-ins, answers) in `((double parentheses))`. Client parses: outside parens = **black** (book verbatim), inside = **grey** (agent's own). Parens are stripped for display.
- **Why:** Earlier we classified by **verbatim text-matching** against the chapter — worked only while the model read verbatim, and broke the moment it paraphrased. Then tried **role-based** (turn context). Settled on prompt-emitted markers because it's the only reliable signal when the model paraphrases, and it moves control to the prompt. **Caveat:** double-parens must stay *silent* in TTS (item #3 in the action plan tracks a fallback marker if they get vocalized).

### A6. Progress + section tracking = one verbatim word-pointer
- **Status:** Active.
- **Decision:** A single pointer advances by **word-aligning the verbatim (non-aside) narration** against the chapter text. It drives **both** the % bar and the section states (done/active/remaining). Asides and Q&A never advance it.
- **Why:** One source of truth; only actual book-reading moves progress. Directly depends on A4 (verbatim) + A5 (parens exclude asides).

### A7. RAG / retrieval — parked
- **Status:** Parked ("next likely work").
- **Decision:** Today the **full current chapter** is stuffed into the Live system prompt; the agent answers only from that chapter (no whole-book reach). Chose to keep chapter-only for now.
- **Why deferred:** Full-book Q&A needs retrieval (embeddings + a `lookup()` function-call tool). It's the right fix for cost (Live re-bills context) + cross-chapter Q&A, but not needed yet. Naive section-by-section feeding was rejected (breaks Q&A context).

### A8. Voice interaction = voice-only; generation params planned
- **Status:** Active (voice-only: speak to interrupt/continue; only scroll + End Session are buttons). Generation params (temp 0.2, top_p 0.8, max-tokens) are **planned** (action items 9–14).
- **Why low temp:** verbatim faithfulness — low temperature/top-P reduce paraphrasing. **Explicitly avoid** frequency/presence penalties (they'd penalize the book's natural repetition → push the model to alter the text).

### A9. Voice glitches = main-thread congestion, NOT echo
- **Status:** Diagnosed; fix **parked** (reload workaround for now).
- **Why it matters:** Symptoms (choppy audio + laggy text after a few turns) first looked like acoustic echo / upstream VAD change. **Git proved no voice code changed that day**, and a **hard-reload fixed it** → root cause is **main-thread congestion**: mic capture uses a deprecated `ScriptProcessorNode` (main thread) competing with the 60fps waveform + React re-renders. **Fix ladder (parked):** lighten main-thread load (throttle waveform, optimize per-chunk transcript work) first; migrate mic capture to an **AudioWorklet** only if needed. Lesson: "it worked yesterday, no code change" → suspect environment/upstream/perf, and verify with git + a reload test before theorizing.

### A10. Transcript bubble fidelity: render tail-drop + cross-turn buffer resets
- **Status:** Fixed (2026-07-06).
- **Symptom:** words the agent *spoke in audio* were missing from the on-screen bubble — mid/end of a segment and, in a later regression, the *beginning* of a turn; user bubbles clipped too.
- **Causes & fixes:** (1) **Render tail-drop** — `toParagraphs` (`GeminiLiveModal.jsx`) split narration on `.!?` and **discarded any not-yet-terminated trailing text**, so the tail of every streaming/segment-ending run was thrown away. Fixed to preserve the remainder after the last matched sentence. (2) **Cross-turn buffer lifecycle** (`geminiLive.js`) — the agent bubble now resets on `turnComplete`/`interrupted`, and the **user** bubble resets when the *model begins replying* (`_startAgentBubble`), **not** on the model's `turnComplete` (which can land *after* the user already started their next utterance, wiping its opening words). A bubble is created by whichever signal (audio or transcription) arrives first.
- **Rejected:** a "lazy reset / audio-anchored rotation" attempt — it glued the next turn's opening words onto the previous bubble (beginning-eating). Reverted to eager reset.
- **Principle reaffirmed:** downstream *render/buffer* loss (text the model DID produce) is a code fix — distinct from prompt-governed behaviour (paraphrasing, missed `((...))` → `live_system_prompt`) and from pre-model capture/VAD loss.

### A11. Long-chapter session resumption + auto-reconnect
- **Status:** Shipped (2026-07-06) — **supersedes** the "session resumption not built" note in A9 / D3.
- **Decision:** setup enables `sessionResumption` + `contextWindowCompression: { slidingWindow }`; the client stores the server's `sessionResumptionUpdate` handle and, on an unexpected `ws.onclose` (not an intentional `end()`), transparently re-opens with the handle (up to 5 attempts, backoff), **reusing the live mic/AudioContexts + in-memory progress pointer**, then nudges the model to continue verbatim. A `this.ws !== ws` guard ignores a stale socket's close. UI adds a `reconnecting` state with a friendly countdown ("Hope you're having a lot of fun! Let's continue in {n}…") that dismisses the instant playback resumes.
- **Why:** replaces the old dead-end ("reopen to continue") so a ~30-min chapter survives the ~10-15 min socket limit.
- **Caveat:** preview-API field names (`sessionResumption`, `contextWindowCompression.slidingWindow`, `sessionResumptionUpdate`) confirmed working against `gemini-3.1-flash-live-preview`; may drift server-side (A3/A9).

### A12. Interruption robustness: ambient noise vs. second speaker (next)
- **Status:** Scoped, **not built**.
- **Two distinct problems:** (a) **ambient noise** (cafe) — *cheap*: mic already requests `echoCancellation`/`noiseSuppression`/`autoGainControl`; add VAD sensitivity/prefix-padding tuning + optional WASM denoise (RNNoise). (b) **second human speaker** (call-centre) — *hard*: needs **voiceprint enrollment + client-side speaker verification** (ONNX/WASM speaker embedding) gating audio *before* Gemini, since Gemini Live has **no server-side target-speaker hook**; likely forces the AudioWorklet migration (A9).
- **Key fact:** pitch alone is **not** a reliable identifier — a speaker *embedding* (timbre/formants, many dims) is. Do (a) first; (b) is a separate larger project.

---

## B. Content pipeline

### B1. Content model: `books.chapters` JSONB with nested sections
- **Status:** Active. Each book row holds a `chapters` JSONB array; each chapter has `content` + nested `sections[]` (`{ number, title, text, cartesia_document_id }`). Section numbers **restart per chapter** — a bare section number is meaningless without its chapter.
- **Why:** Simple, colocated with the book; the voice agent reads sections straight from here. **Discipline:** never fetch sections via a flat query by `chapter_number` (numbers repeat) — always via the nested chapter object.

### B2. Admin content pipeline: EPUB → Generate → Split → Sync
- **Status:** Active. **EPUB** = extract chapter text (JSZip + DOMParser); **Generate** = Gemini authors chapter list / one-liners + section titles; **Split** = chunk `content` into ~350-word sections; **Sync KB** = push sections to Cartesia (folder + per-section docs). Gemini Live needs only EPUB + Split (Sync is Cartesia-only).

### B3. 100%-coverage chunking (merge-not-drop) + assertion
- **Status:** Fixed in code; **existing books still need a lossless re-split** (action item #2).
- **Why:** The old `splitIntoSections` **dropped every paragraph ≤40 chars**, silently losing text (measured: *The Hard Thing* ch18 kept only 38%). New splitter **merges** short paragraphs; `sectionCoverage()` asserts 100% and the admin flags `⚠️cov`. Re-splitting existing books must **preserve section titles + `cartesia_document_id`** (naive re-split wipes them).

### B4. EPUB parser is a text extractor, not a rich parser
- **Status:** Known limitation. Extracts clean reading text + h1–h4 + basic lists. **Drops** images, link URLs, page numbers, tables, `<figcaption>` captions. DRM/non-ZIP files now fail with a clear message (PK signature check).
- **Why:** Optimized for narration text. Rich extraction (images/captions/links) is a future parser upgrade if needed.

### B5. Hard-delete book + Cartesia de-sync (parallel batches)
- **Status:** Shipped. Admin 🗑 → `book-delete` edge function: de-syncs Cartesia docs+folder, deletes `voice_progress`, deletes the book (sessions/requests/etc. cascade via FK).
- **Why batched:** Sequential deletion of 149–345 Cartesia docs took >60s → browser dropped the request. **Parallel batches of 25** → ~3–5s. Lesson: any per-item loop over hundreds of external API calls must be parallelized/batched.

---

## C. Data / infra

### C1. `bookStore` eager-loads all content (3 MB) — lazy-load agreed
- **Status:** **Shipped (2026-07-06).**
- **Why:** Public `bookStore.fetchBooks()` did `select('*')` → downloaded **every book's full chapter text (~2.77 MB of 3 MB)** on startup just to show the grid; grew linearly with the catalog → slow.
- **Implementation:** `fetchBooks()` now selects **light columns only** (no `chapters`); new `fetchBookChapters(bookId)` (memoized) lazy-loads a book's `chapters` when its `BookDetail` opens (spinner while loading), so Talk inherits them. `adminDataStore` was already light. Full-text-only-at-Talk still deferred (single-JSONB storage would need server work); the current per-book load on BookDetail-open is the accepted cost.

### C2. `language` column added; `publisher`/`pub_date` dropped
- **Status:** Shipped. `addBook` was inserting 3 non-existent columns → PostgREST error. Added `language` (migration 004, useful for multilingual roadmap); removed `publisher`/`pub_date` from insert + their dead display lines.

### C3. Repo layout + remote
- **Status:** Active. The project lives at **`hridyanshu7/books-p2p/vyaz/`** (nested one level — a Claude session is anchored to `books-p2p/`, so we keep the project inside it; the `vyaz/` name was the intended rename). GitHub remote = **`Hridyanshu7/vyaz-web.git`**. Deploy: `vercel --prod` (or git push) for frontend; `npx supabase functions deploy <name>` for edge functions.

---

## D. Strategy / business

### D1. Target segment: premium learners (India)
- **Status:** Active positioning. Students/aspirants/professionals/English-first; WTP ~₹299–499/mo. Positioned as a **premium AI study companion**, priced to stay India-accessible.
- **Why:** Mass value-conscious Indian consumers cap at ₹99–199/mo — **below our per-chapter cost**. Premium learners' WTP actually clears cost.

### D2. Pricing: Freemium 3-tier + verbatim credits
- **Status:** Recommended (see [pricing.md](pricing.md)). Free (2–3 concise ch) → ₹199 Learner → ₹449 Scholar; verbatim as ₹99/ch credits. **No text-summary tier** — the transcript *is* part of the audio experience, not a separate SKU.
- **Cost lever:** concise/discussion mode (~₹17/ch) as everyday default vs verbatim (~₹75/ch) premium. Cost reduction (₹17→₹10) is strategic, not cosmetic.

### D3. Unit economics + the scaling wall
- **Status:** Documented ([unit-economics.md](unit-economics.md)). ~$0.90 per verbatim chapter (~30 min audio; audio-output dominates). Two hard limits: **~3 concurrent Live sessions/key** (→ Vertex for 1,000) and **~10–15 min per WebSocket connection** (a 30-min chapter needs session resumption — not yet built).

### D4. Voice-provider comparison conclusion
- **Status:** Documented ([voice-providers-comparison.md](voice-providers-comparison.md)). **Gemini Live stays default** (cheapest all-in, unified, multilingual). **Bolna** is the only one worth revisiting — and only for a **phone-based India channel** (telephony, not language; Gemini already does Indian languages). Vobiz = telephony infra, not a voice-agent brain.
