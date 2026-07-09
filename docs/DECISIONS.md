# Vyaz — Decision Log (ADRs)

_Append-only record of the significant decisions and pivots, with the **why** behind them. Newest sections grouped by theme. Format per entry: **Decision · Status · Why · Alternatives considered.** Last updated: 2026-07-09 (A15/A16)._

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

### A13. Whole-book Gist (AI summary mode)
- **Status:** Shipped (client + edge fn) 2026-07-07 — **gated on Gemini quota/billing** (whole-book input is large).
- **Decision:** The "Book Gist (AI)" button opens the **same GeminiLiveModal in `gist` mode** — a reliable whole-book *summary* (not verbatim), conversational (interrupt + Q&A), with its **own admin-editable prompt** (`live_gist_prompt`, **Gemini-Live-only**; default fallback lives in `voice-session`). No verbatim word-alignment/progress in gist mode.
- **Client-side content:** the whole-book text is assembled in the browser (chapters already in `bookStore`) and sent to the edge fn — **no per-request DB blob fetch**, so concurrent gist requests don't amplify heavy reads.
- **Caveat:** whole-book context is a large input → hits Gemini quota on the current tier (needs billing/higher tier or Vertex; very long books may exceed context even with slidingWindow). RAG (A7) is the eventual fix.
- **Update (2026-07-07):** the BookDetail **Gist button was removed** so users don't hit the quota error; the feature code (edge fn `mode:'gist'`, modal gist mode, `live_gist_prompt`) is **retained**. Re-enable = action plan item 36.

### A14. AudioWorklet mic capture (the A9 fix, executed)
- **Status:** Shipped 2026-07-07.
- **Decision:** Mic capture moved **off the main thread** to an **AudioWorklet** (`src/lib/pcmCaptureProcessor.js`, batches ~2048 samples) with a **ScriptProcessorNode fallback** (try/catch on worklet load, so Talk always works). Emits `mic_capture {mode}` / `audioworklet_failed`.
- **Why:** executes the A9 fix ladder — the deprecated `ScriptProcessorNode` ran on the main thread competing with the waveform + React re-renders (choppy audio/laggy text after a few turns). Also the **prerequisite** for heavier audio work (RNNoise denoise, target-speaker — A12).

### A15. Durable session history + post-session star rating
- **Status:** Shipped 2026-07-07 (migrations `008` `voice_sessions`, `009` rating columns) — **backfilled into this log**, was already live but undocumented here.
- **Decision:** Every Talk/Gist session, across all three voice providers, gets one row in **`voice_sessions`**: `data` JSONB holds `{ meta, turns }` (the full transcript), written once at session end (`endVoiceSessionRecord`, `voiceSessionLog.js`). A mandatory 1-5★ + optional free-text rating (`SessionRatingScreen.jsx`) is collected right after, as a **separate follow-up write** (`submitSessionRating`) rather than bundled into the same call.
- **Why separate writes:** if the user abandons the tab on the rating screen, the transcript + `ended_at` (already saved) survive — only the rating itself would be missing. Matches the existing "best-effort, never block the voice UX" convention used for `voice_events`.
- **Distinct from:** `voice_events` (technical debug log: connects/drops/errors) and `voice_progress` (legacy narration progress bar, pipeline/Cartesia only — Gemini Live doesn't write to it).

### A16. Per-message thumbs up/down + confirmable remarks (Gemini Live only)
- **Status:** Shipped 2026-07-09.
- **Decision:** Each **agent** bubble in `GeminiLiveModal` gets thumbs up/down; thumbs-down opens a remarks field. `adminStore.setVoiceMessageFeedback` patches `{ thumbs, remarks }` directly onto the message object already held in `voiceTranscripts` — since `endVoiceSessionRecord` reads that same array as `turns` at session end (A15), feedback rides into `voice_sessions.data.turns[i].feedback` for free, **no new table or migration**.
- **Remarks require explicit submit:** typing only updates local component state; Enter or the send button commits to the store. Once submitted it collapses to a read-only line; clicking it re-opens editing. Chosen over live-as-you-type persistence — an editable field with no confirmation step reads as unfinished/uncertain input, not a submitted rating.
- **Timing caveat (inherited from A15):** feedback only survives if given before **End Session** is clicked — a crash/force-close mid-conversation loses it, same as the rest of the transcript.
- **Scope:** **Gemini Live only** for now. `VoicePipelineModal`/`VoiceAgentModal` (the other two providers) don't have this yet — explicitly parked, not an oversight.

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
- **Status:** **Superseded 2026-07-09 — see B7.** Extracts clean reading text + h1–h4 + basic lists. **Drops** images, link URLs, page numbers, tables, `<figcaption>` captions. DRM/non-ZIP files now fail with a clear message (PK signature check).
- **Why:** Optimized for narration text. Rich extraction (images/captions/links) is a future parser upgrade if needed.

### B5. Hard-delete book + Cartesia de-sync (parallel batches)
- **Status:** Shipped. Admin 🗑 → `book-delete` edge function: de-syncs Cartesia docs+folder, deletes `voice_progress`, deletes the book (sessions/requests/etc. cascade via FK).
- **Why batched:** Sequential deletion of 149–345 Cartesia docs took >60s → browser dropped the request. **Parallel batches of 25** → ~3–5s. Lesson: any per-item loop over hundreds of external API calls must be parallelized/batched.

### B6. OCR ingestion (Sarvam Vision) — parked / research
- **Status:** Parked (research). See action plan item 35.
- **Decision:** Consider **Sarvam Vision / Document Digitisation API** (3B VLM; English + 22 Indian languages; preserves structure/reading order; strong Indic OCR) as a **second ingestion path** for scanned / image-based PDFs the EPUB parser can't handle (B4). Server-side via an edge fn (key off the client); output feeds the existing **Generate → Split**.

### B7. Structured content model — blocks replace the flat content string
- **Status:** Shipped 2026-07-08/09 (parser + storage). **Phase 3 — live multimodal wiring in `geminiLive.js` so the agent actually uses this in conversation — not yet built.**
- **Decision:** `chapter.content` (flat string) is now **derived and cached** from a new `blocks` array per chapter — `heading` (real level 1-4, not a `#`-prefix hack), `paragraph` (inline `spans` with `bold`/`italic`/`underline` marks), `list`, `table` (real row/cell structure), `image` (alt/caption + uploaded asset URL — see B8/B9), and `svg` (inline vector charts, raw markup + title/desc). Blocks emitted from inside an `<aside>` or an element tagged with a recognized `epub:type` (`sidebar`/`tip`/`note`/`practice`/etc.) carry a `role` field — `<aside>` is **no longer stripped** (the old parser deleted it outright; in real EPUBs it holds genuine sidebar/tip content, not decoration). Page markers (`epub:type="pagebreak"`) captured best-effort — many EPUBs have none at all (page numbers are a print concept), useful where present for loss/coverage QA and conversational "as covered on page N" references.
- **Bold/italic/underline captured but NOT used in voice this phase** — confirmed Gemini Live's TTS has no SSML/per-word emphasis control, so "faithful emphasis in audio" isn't mechanically possible today; data is there if a future surface can use it.
- **No pre-baked AI captions for images/charts.** Confirmed Gemini Live's `realtimeInput` accepts image frames into an active session (base64, same channel as mic audio) — the agent will get the actual image as live multimodal context and describe it only if the conversation calls for it, not a canned description written ahead of time.
- **Folded in:** the multi-file-chapter-merge bug (an untitled spine file under ~500 words merges into the previous chapter instead of becoming a bogus new "Chapter N"; a substantial untitled file still gets its own chapter, to avoid silently merging two real chapters when a book's TOC is sparse).
- **Why no visual reader UI:** the product surface for this is conversational (speech bubbles), not a rendered document view — see D5's AI-only direction. A synced visual read-along panel was explicitly scoped **out** as a follow-on, not part of this work.

### B8. Blocks live in their own table, not nested in `books.chapters`
- **Status:** Shipped (migration `010_book_content_blocks.sql`).
- **Decision:** `book_content_blocks` — one row per (book, chapter) — holds `blocks`, **not** nested inside `books.chapters`.
- **Why:** blocks are far more verbose JSON than the old flat string (every paragraph is now a spans array; every image carries assetUrl/alt/caption/page). Nesting them would bloat **every** unrelated read/write of a book's chapters — including the admin Catalog tab's eager `select('id, chapters, ...')` for the **entire** catalog at once, and every Split/Generate/Regen write, which rewrite the whole `chapters` column regardless of what changed. Confirmed in practice: embedding blocks in `chapters` visibly slowed the admin Books tab; moving them out (and re-parsing) measurably fixed it. Anticipated to matter more, not less, as more image/table-dense titles are added.
- **Rejected:** stripping `blocks` from the admin listing via a Postgres JSONB-transform RPC — a band-aid on one query that leaves the underlying write-amplification problem (Split/Generate/Regen still shuttling a growing blob) unfixed.
- RLS: public read (same sensitivity as `books.chapters`, already public); admin-only write (reuses `is_admin()` from migration 007). Cascades on book delete via FK — no extra cleanup code needed.

### B9. Image/asset storage (`book-assets` bucket)
- **Status:** Shipped.
- **Decision:** Images extracted from the EPUB zip during parsing, uploaded to a **public Supabase Storage bucket** `book-assets` (one folder per `book_id`), URL stored on the image block (`src/lib/bookAssets.js`). Bucket created manually via the dashboard (Storage buckets aren't SQL migrations).
- **Real gotcha (migration `011_book_assets_storage_rls.sql`):** a Storage bucket's "public" toggle only controls **reads**. Uploads are governed separately by RLS on Supabase's internal `storage.objects` table, which denies everything until an explicit policy grants it — every image upload failed with `new row violates row-level security policy` until this policy was added (admin-only write via `is_admin()`, public read). Same mental model as table RLS, easy to miss since Storage doesn't surface it as obviously.
- Cleanup: `book-delete` edge fn purges a deleted book's asset folder (Storage isn't FK-linked, so this needs explicit code, unlike `book_content_blocks`'s cascade).

### B10. Real EPUB files are messier than the spec — lessons from a live debugging session
- **Status:** Fixed; worth remembering for any future ingestion work.
- **Found via a real book ("Romancing The Balance Sheet"):** (1) **a wrapping top-level folder** in the zip — the file had been re-zipped from an *extracted* folder rather than its contents (a common real-world mistake, e.g. macOS/Windows "Compress" on an unzipped folder), so `META-INF/container.xml` wasn't at the true zip root. Fixed by locating `container.xml` anywhere in the archive and treating whatever precedes it as a shared prefix applied to every subsequent path — a general, non-destructive fix, not a one-off hack for this file. (2) **HTML file inputs don't fire `onChange` when the exact same file is re-selected** (a known browser quirk) — silently made repeated debugging attempts look like "nothing happens." Fixed by resetting the input's `value` before each pick. (3) **Errors caught by the UI were being silently swallowed** — only shown in a 50-character-truncated status badge, never logged to console — made every one of the above take far longer to diagnose than necessary. Fixed by adding explicit `console.error` at the catch site.
- **Lesson:** when a parser/ingestion error is opaque, harden the failure path (clear error messages + full console logging) **before** trying to guess the root cause from a truncated UI string — this alone would have cut the diagnosis time substantially.
- **Why not now:** EPUB covers the current catalog; OCR is only for scanned/image sources; free through Feb 2026 but **post-free per-page pricing** (a one-time ingest cost), async/batch for long books, and copyright of scanned commercial books all need checking. Preview API.

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

### C4. `voice_provider` public scoped read (migration 006)
- **Status:** Shipped 2026-07-06.
- **Decision:** `platform_settings` is admin-only (holds secrets), so non-admin/logged-out users couldn't read `voice_provider` → Talk fell back to the wrong provider (Cartesia). Added a **scoped RLS policy** exposing ONLY the `voice_provider` row to `anon`/`authenticated` (each setting is its own row → secrets stay hidden). Client `bookStore.fetchVoiceProvider()` reads it; `BookDetail` precedence = admin settings → public read → `gemini_live` default.
- **Why:** a public page's behaviour must not depend on admin-only data, and secrets must not leak (RLS is row-scoped, so a single key can be exposed safely).

### C5. `profiles` RLS lock + `is_admin()` helper (migration 007)
- **Status:** Shipped 2026-07-07.
- **Decision:** A leftover `"Public profiles" (SELECT true)` policy (from the removed public narrator directory) let **anon read every profile incl. email** — a PII leak. Dropped it; profiles now readable only by the owner (`auth.uid() = id`) or admins. Admin checks use a **`SECURITY DEFINER public.is_admin()`** helper.
- **Lesson:** an inline `EXISTS(select … from profiles …)` inside a policy **on** `profiles` causes **42P17 infinite recursion** once the permissive public policy is gone — a policy on a table that queries the same table needs a SECURITY DEFINER helper.

### C6. Admin moved to its own `/admin` route
- **Status:** Shipped 2026-07-07.
- **Decision:** The Admin panel used to be a **tab inside the Dashboard**; removing `/dashboard` in the P2P pivot orphaned it. Gave Admin its own **`/admin` route** (`is_admin`-gated, non-admins → `/`) + an admin-only header link. Regression fix surfaced by the pivot.

---

## D. Strategy / business

### D1. Target segment: premium learners (India)
- **Status:** Active positioning. Students/aspirants/professionals/English-first; WTP ~₹299–499/mo. Positioned as a **premium AI study companion**, priced to stay India-accessible.
- **Why:** Mass value-conscious Indian consumers cap at ₹99–199/mo — **below our per-chapter cost**. Premium learners' WTP actually clears cost.

### D2. Pricing: Freemium 3-tier + verbatim credits
- **Status:** Recommended (see [pricing.md](pricing.md)). Free (2–3 concise ch) → ₹199 Learner → ₹449 Scholar; verbatim as ₹99/ch credits. **No text-summary tier** — the transcript *is* part of the audio experience, not a separate SKU.
- **Cost lever:** concise/discussion mode (~₹17/ch) as everyday default vs verbatim (~₹75/ch) premium. Cost reduction (₹17→₹10) is strategic, not cosmetic.
- **Update (2026-07-07): concise mode decided against.** No non-verbatim narration mode — reaffirms A4 (concise/discussion would also re-break progress tracking + black/grey classification, which require verbatim delivery). Pricing must lean on other levers (credits, tiering), not a concise SKU.

### D3. Unit economics + the scaling wall
- **Status:** Documented ([unit-economics.md](unit-economics.md)). ~$0.90 per verbatim chapter (~30 min audio; audio-output dominates). Two hard limits: **~3 concurrent Live sessions/key** (→ Vertex for 1,000) and **~10–15 min per WebSocket connection** (a 30-min chapter needs session resumption — not yet built).

### D4. Voice-provider comparison conclusion
- **Status:** Documented ([voice-providers-comparison.md](voice-providers-comparison.md)). **Gemini Live stays default** (cheapest all-in, unified, multilingual). **Bolna** is the only one worth revisiting — and only for a **phone-based India channel** (telephony, not language; Gemini already does Indian languages). Vobiz = telephony infra, not a voice-agent brain.

### D5. Pivot to AI-only — remove human-narrator / P2P
- **Status:** Active — **Phase A shipped** (P2P UI hidden); Phases B (dead-code delete), C (DB drops), D (docs) in progress. See action plan items 24–28.
- **Decision:** Remove the entire human-narrator / P2P side — narrator profiles, availability, bookings, reviews, group sessions, requests, and the Google Calendar (`gcal`) integration. **Humans are only users; all narration is AI** — verbatim chapter Talk + whole-book **Gist** (A13). Narrator `role`/columns deleted outright (never returning); **no data export** (only 2 users, both narrator+listener).
- **Why:** focus the product on the AI-voice thesis (faithful narration, anti-slop, conversation as the human medium) instead of an unused two-sided marketplace. This **supersedes the "human narrator sessions" framing** throughout the older docs.
- **Rollout discipline:** phased, **code-first / DB-last** — dropping a table while code still queries it 404s prod and can crash the catalog/admin `Promise.all` inits.
