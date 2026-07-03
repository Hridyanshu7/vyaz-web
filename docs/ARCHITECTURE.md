# Vyaz — Architecture Snapshot

_Current-system map. Last updated: 2026-07-03. For the **why** behind these choices, see [DECISIONS.md](DECISIONS.md)._

## Product in one line
A P2P book-knowledge marketplace where readers **talk to books** — an AI voice agent narrates a chapter verbatim and answers questions — plus human narrator sessions (1:1 and group).

## Stack
- **Frontend:** React 18 + Vite + Tailwind CSS v4, React Router, **Zustand** stores. Deployed on **Vercel** (`vyaz.vercel.app`).
- **Backend:** **Supabase** — Postgres + Auth + Realtime + RLS + **Edge Functions** (Deno/TypeScript).
- **AI:** **Google Gemini** — Live API (voice), text (chapter/one-liner generation), TTS (pipeline fallback). **Cartesia** (Sonic TTS + Line agent + folder KB) as an alternate provider.
- **Repo:** `hridyanshu7/books-p2p/vyaz/` (nested — see DECISIONS C3). Remote: `Hridyanshu7/vyaz-web`.

## Data model (key tables)
- **`books`** — `id, title, author, cover_url, description, genres, language, page_count, isbn, goodreads_data, amazon_data, goodreads_rating…, cartesia_folder_id, is_published`, and **`chapters`** (JSONB, the heavy column). Each chapter: `{ number, title, oneliner, content, sections: [{ number, title, text, cartesia_document_id }] }`. Section numbers restart per chapter.
- **`profiles`** — users; `is_admin`, `role`, `gcal_*`.
- **`sessions` / `session_attendees` / `session_requests`** — human narrator sessions (migration `003`); `book_id` FKs **cascade** on book delete.
- **`platform_settings`** — key/value config (API keys, prompts, `voice_provider`, `live_model`, `live_voice`, pipeline models, Cartesia IDs). Created in dashboard; **not** all in migrations.
- **`voice_progress`** — per-session narration progress (`session_id, book_id, chapter_number, total_sections, completed_sections`). Dashboard-created.
- Migrations in `supabase/migrations/` (`001` schema, `002` users, `003` sessions, `004` add `books.language`). Note: `platform_settings` + `voice_progress` were created directly in the dashboard.

## Zustand stores (`src/stores/`)
- **`bookStore`** — public books/narrators; `fetchBooks()` currently `select('*')` (eager — see DECISIONS C1); `addBook`, `removeBook`, `getBook`, filtering.
- **`adminDataStore`** — admin data (all books incl. unpublished, users, sessions, `platformSettings`); **excludes** heavy `chapters` from startup, lazy-loads them. `updateBook`, `removeBook`, `updateSetting`.
- **`adminStore`** — persisted UI/op state: `voiceTranscripts` (speech bubbles), `opStatus`/`opProgress` (chapter ops), pending `userChanges`/`bookChanges`.

## Voice agent (the heart)
- **Provider switch:** `platform_settings.voice_provider` → `BookDetail.jsx` routes the Talk button to `GeminiLiveModal` | `VoicePipelineModal` | `VoiceAgentModal` (Cartesia).
- **Gemini Live (primary):** `src/lib/geminiLive.js` — `GeminiLiveSession` opens a WebSocket to `…BidiGenerateContent`, streams mic (16kHz PCM) + plays back (24kHz PCM), parses `((...))` asides, tracks progress by verbatim word-alignment. UI: `src/components/GeminiLiveModal.jsx` (2-column: transcript + waveform/section-progress/controls).
- **Session config:** `supabase/functions/voice-session` returns the Gemini key, the built system prompt (chapter content injected), model, voice, and sections. **The verbatim + `((...))` system prompt lives here** (`live_system_prompt` overridable in Admin).
- **Custom pipeline (alt):** `src/lib/voicePipeline.js` — discrete STT→LLM→TTS Gemini calls with pre-fetch; `VoicePipelineModal.jsx`.

## Edge functions (`supabase/functions/`)
- **`voice-session`** — assembles voice config + system prompt from `platform_settings` (holds secrets server-side); creates `voice_progress`.
- **`cartesia-kb-sync`** — syncs chapters/sections to a Cartesia folder as documents.
- **`book-delete`** — admin-only hard delete: parallel-batch de-sync of Cartesia docs+folder, delete `voice_progress`, delete book row.
- **`gcal`**, **`cartesia-token`**, **`cartesia-tool`** — calendar + Cartesia helpers.

## Admin content pipeline (`src/components/admin/AdminPanel.jsx`)
Per-book buttons: **EPUB** (`parseEpub` → chapter text) → **Generate/Regen** (`gemini.js` → chapter list or one-liners+section titles) → **Split** (`splitIntoSections` → sections, `sectionCoverage` asserts 100%) → **Sync KB / Re-sync** (Cartesia) → **🗑 Delete** (`book-delete`). Also: Agents tab (provider switcher + Gemini/Gemini-Live/Cartesia config cards), Users, Group Sessions.

## Key flows
- **Talk (Gemini Live):** BookDetail Talk (auth-gated — action item #15) → `getGeminiLiveSession` (`voice-session` edge fn) → `GeminiLiveSession.start()` → WS narrates the chapter verbatim, `((...))` asides grey, progress via word-alignment; speak to interrupt/continue.
- **Add a book:** `addBook` (bookStore) → EPUB/Generate/Split/Sync in admin → published book appears in the grid.
- **Deploy:** frontend `vercel --prod` (or git push → Vercel); edge fn `npx supabase functions deploy <name>`; DB changes via Supabase SQL editor / migrations.

## Known constraints / debt (see DECISIONS + action plan)
- `bookStore` eager-loads all chapter text (~3 MB) on startup (C1) — lazy-load agreed, not built.
- Gemini Live: ~3 concurrent sessions/key (→ Vertex for scale); ~10–15 min/WebSocket (long chapters need session resumption — not built).
- Voice mic capture uses deprecated `ScriptProcessorNode` (main-thread) — perf ceiling (DECISIONS A9).
- Existing books need a lossless re-split for 100% coverage (action item #2).
