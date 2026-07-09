# Vyaz — Architecture Snapshot

_Current-system map. Last updated: 2026-07-09. For the **why** behind these choices, see [DECISIONS.md](DECISIONS.md)._

## Product in one line
A P2P book-knowledge marketplace where readers **talk to books** — an AI voice agent narrates a chapter verbatim and answers questions — plus human narrator sessions (1:1 and group).

## Stack
- **Frontend:** React 18 + Vite + Tailwind CSS v4, React Router, **Zustand** stores. Deployed on **Vercel** (`vyaz.vercel.app`).
- **Backend:** **Supabase** — Postgres + Auth + Realtime + RLS + **Edge Functions** (Deno/TypeScript).
- **AI:** **Google Gemini** — Live API (voice), text (chapter/one-liner generation), TTS (pipeline fallback). **Cartesia** (Sonic TTS + Line agent + folder KB) as an alternate provider.
- **Repo:** `hridyanshu7/books-p2p/vyaz/` (nested — see DECISIONS C3). Remote: `Hridyanshu7/vyaz-web`.

## Data model (key tables)
- **`books`** — `id, title, author, cover_url, description, genres, language, page_count, isbn, goodreads_data, amazon_data, goodreads_rating…, cartesia_folder_id, is_published`, and **`chapters`** (JSONB). Each chapter: `{ number, title, oneliner, content, sections: [{ number, title, text, cartesia_document_id }] }`. Section numbers restart per chapter. **Kept deliberately lean** — rich structured content lives separately (see `book_content_blocks`, DECISIONS B7/B8).
- **`book_content_blocks`** — one row per (book, chapter): `blocks` JSONB (`heading`/`paragraph`-with-inline-marks/`list`/`table`/`image`/`svg`, each optionally carrying `role` for sidebar/tip/note content and `page` where detectable). Written by the EPUB parser; **not yet read by the live voice session** (Phase 3, not built). Public read, admin write (migration `010`).
- **`voice_sessions`** — durable per-session history across all three voice providers: one row per session, `data` JSONB holding `{ meta, turns }` (the full transcript) plus a 1-5 `rating` + optional `feedback_text` (migrations `008`/`009`). Distinct from `voice_events` (technical debug log) and `voice_progress` (legacy live progress bar, pipeline/Cartesia only).
- **`profiles`** — users; `is_admin`, `role`, `gcal_*`.
- **`sessions` / `session_attendees` / `session_requests`** — human narrator sessions (migration `003`); `book_id` FKs **cascade** on book delete. **Being removed** — see AI-only pivot below.
- **`platform_settings`** — key/value config (API keys, prompts, `voice_provider`, `live_model`, `live_voice`, pipeline models, Cartesia IDs). Created in dashboard; **not** all in migrations.
- **`voice_progress`** — per-session narration progress (`session_id, book_id, chapter_number, total_sections, completed_sections`). Dashboard-created; Gemini Live doesn't write to it (see `voice_sessions` above).
- Migrations in `supabase/migrations/` (`001` schema … `011` book-assets storage RLS — see the migrations folder for the full list). Note: `platform_settings` + `voice_progress` were created directly in the dashboard.

## Zustand stores (`src/stores/`)
- **`bookStore`** — public books/narrators; `fetchBooks()` selects **light columns only** (no `chapters`); `fetchBookChapters(id)` lazy-loads a book's `chapters` on BookDetail open (memoized — DECISIONS C1); `addBook`, `removeBook`, `getBook`, filtering.
- **`adminDataStore`** — admin data (all books incl. unpublished, users, sessions, `platformSettings`); **excludes** heavy `chapters` from startup, lazy-loads them. `updateBook`, `removeBook`, `updateSetting`.
- **`adminStore`** — persisted UI/op state: `voiceTranscripts` (speech bubbles), `opStatus`/`opProgress` (chapter ops), pending `userChanges`/`bookChanges`.

## Voice agent (the heart)
- **Provider switch:** `platform_settings.voice_provider` → `BookDetail.jsx` routes the Talk button to `GeminiLiveModal` | `VoicePipelineModal` | `VoiceAgentModal` (Cartesia).
- **Gemini Live (primary):** `src/lib/geminiLive.js` — `GeminiLiveSession` opens a WebSocket to `…BidiGenerateContent`, streams mic (16kHz PCM) + plays back (24kHz PCM), parses `((...))` asides, tracks progress by verbatim word-alignment. **Session resumption + auto-reconnect** (`sessionResumption` + `slidingWindow` compression; re-opens on unexpected close, reusing mic + progress) keeps long chapters alive past the ~15-min socket limit (DECISIONS A11). Transcript bubbles are reset per-turn to avoid cross-turn word loss (A10). UI: `src/components/GeminiLiveModal.jsx` (2-column: transcript + waveform/section-progress/controls; `reconnecting` state shows a countdown).
- **Session config:** `supabase/functions/voice-session` returns the Gemini key, the built system prompt (chapter content injected), model, voice, and sections. **The verbatim + `((...))` system prompt lives here** (`live_system_prompt` overridable in Admin).
- **Custom pipeline (alt):** `src/lib/voicePipeline.js` — discrete STT→LLM→TTS Gemini calls with pre-fetch; `VoicePipelineModal.jsx`.

## Edge functions (`supabase/functions/`)
- **`voice-session`** — assembles voice config + system prompt from `platform_settings` (holds secrets server-side); creates `voice_progress`.
- **`cartesia-kb-sync`** — syncs chapters/sections to a Cartesia folder as documents.
- **`book-delete`** — admin-only hard delete: parallel-batch de-sync of Cartesia docs+folder, delete `voice_progress`, delete book row.
- **`gcal`**, **`cartesia-token`**, **`cartesia-tool`** — calendar + Cartesia helpers.

## Admin content pipeline (`src/components/admin/AdminPanel.jsx`)
Per-book buttons: **EPUB** (`parseEpub` → chapter text + structured `blocks` → `book_content_blocks`, images uploaded to Storage — DECISIONS B7-B9) → **Generate/Regen** (`gemini.js` → chapter list or one-liners+section titles) → **Split** (`splitIntoSections` → sections, `sectionCoverage` asserts 100%) → **Sync KB / Re-sync** (Cartesia) → **🗑 Delete** (`book-delete`). Also: Agents tab (provider switcher + Gemini/Gemini-Live/Cartesia config cards), Users.

## Key flows
- **Talk (Gemini Live):** BookDetail Talk (auth-gated — action item #15) → `getGeminiLiveSession` (`voice-session` edge fn) → `GeminiLiveSession.start()` → WS narrates the chapter verbatim, `((...))` asides grey, progress via word-alignment; speak to interrupt/continue.
- **Add a book:** `addBook` (bookStore) → EPUB/Generate/Split/Sync in admin → published book appears in the grid.
- **Deploy:** frontend `vercel --prod` (or git push → Vercel); edge fn `npx supabase functions deploy <name>`; DB changes via Supabase SQL editor / migrations.

## Known constraints / debt (see DECISIONS + action plan)
- ✅ `bookStore` lazy-loads chapters now (C1, shipped) — grid cold-load is light.
- ✅ Long chapters auto-resume past the ~10–15 min/WebSocket limit via session resumption + reconnect (A11, shipped).
- ✅ Gemini API key no longer reaches the browser — ephemeral tokens, `v1alpha`/`BidiGenerateContentConstrained` (shipped 2026-07-07).
- Gemini Live: **~3 concurrent sessions/key** (→ Vertex for scale) — **still the mass-usage wall**, not addressed.
- Voice mic capture moved off the main thread to AudioWorklet (A14, shipped) — no longer debt; still a prerequisite for heavier audio work (denoise/target-speaker, A12).
- Existing books need a lossless re-split for 100% coverage (action item #2) — likely combinable with re-running EPUB now that the parser is much richer (B7).
- Interruption robustness (ambient noise / second speaker) scoped but not built (A12).
- Structured content `blocks` exist (B7/B8) but **nothing reads them yet** — Phase 3 (live multimodal wiring so the agent can discuss images/tables in conversation) not built.

## Recent changes (2026-07-09) — see DECISIONS
- **Structured content model (B7-B10):** `chapter.content` is now derived from a rich `blocks` array (headings with real hierarchy, inline bold/italic/underline marks, real tables, images, inline SVG charts, sidebar/tip/practice `role` tagging) stored in the new **`book_content_blocks`** table, not nested in `books.chapters` (keeps it lean). Images uploaded to a public **`book-assets`** Storage bucket. No pre-baked AI captions — the live session will feed images into Gemini Live's multimodal `realtimeInput` and let the agent describe them only if asked (Phase 3, not yet built). Also fixed: the multi-file-chapter-merge bug diagnosed earlier.
- **Durable voice session history + rating (A13-adjacent, new tables):** `voice_sessions` records every Talk/Gist session (transcript + metadata) across all three providers; a mandatory 1-5 star + optional-text rating is collected inline when a session ends (`SessionRatingScreen.jsx`), saved as a separate follow-up write so the transcript survives even if the user abandons the rating step.

## Recent changes (2026-07-07) — see DECISIONS
- **AI-only pivot (D5):** the human-narrator/P2P side is being removed (**Phase A shipped** — narrator UI, `/dashboard`, `/narrators`, `/availability` gone). ⚠️ The data-model + flows above still describe P2P tables/sessions — those drop in **Phase C** and this doc gets its full cleanup in **Phase D**.
- **Admin** moved from a Dashboard tab to its own **`/admin`** route (`is_admin`-gated) + header link (C6).
- **Whole-book Gist** (AI summary): `voice-session` `mode:'gist'` (own `live_gist_prompt`) + `GeminiLiveModal` gist mode; whole-book content sent client-side (A13). **Button removed from BookDetail pending Gemini billing** (item 36); feature code retained.
- **Mic capture on AudioWorklet** (`src/lib/pcmCaptureProcessor.js`) with a ScriptProcessorNode fallback — the A9 fix (A14).
- **Security/RLS:** `voice_provider` public-scoped read (migration `006`, C4); `profiles` locked to owner+admin via `is_admin()` (migration `007`, C5).
- **Parked:** Sarvam Vision OCR as a future scanned/Indic ingestion path (B6).
