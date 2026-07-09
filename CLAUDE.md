# Vyaz — Project Brief (start here)

_Auto-loaded every session. Keep this concise — it's a map + current-state, not the full story. Deep context lives in the docs linked below._

## What Vyaz is
A P2P **book-knowledge marketplace** where readers **"talk to books"** — an AI voice agent narrates a chapter **verbatim** and answers questions, plus a whole-book AI **Gist** summary. **AI-only** — the human-narrator/P2P side was removed (see DECISIONS D5). Target: **premium learners in India** (AI study companion).

## Stack
React 18 + Vite + Tailwind v4 + Zustand (frontend, on **Vercel**) · **Supabase** (Postgres/Auth/Realtime/RLS/**Edge Functions**) · **Google Gemini** (Live voice + text + TTS) · **Cartesia** (alt voice provider).

## Repo quirks (important)
- **Project path:** `hridyanshu7/books-p2p/vyaz/` — nested one level. (A Claude session is anchored to `books-p2p/`; the real project is inside `vyaz/`. Use absolute paths to `.../books-p2p/vyaz/`.)
- **Git remote:** `Hridyanshu7/vyaz-web.git` (branch `main`).
- **Prod domain:** `www.vyaz.in` (canonical; apex redirects to www). Most URLs use `window.location.origin`, so only `index.html` `og:url` is hardcoded.
- **Deploy:** frontend → `vercel --prod --yes` (or push to `main`); edge fn → `npx supabase functions deploy <name>`; DB → Supabase SQL editor / `supabase/migrations/`.
- Secrets/config live in `platform_settings` (DB), read server-side by edge functions — never expose in client.
- **Auth:** Google + LinkedIn OAuth + email magic-link only; **no `/onboarding`** step (removed). Phone/WhatsApp OTP is built but **hidden everywhere** (no messaging provider wired) — re-enable is a backlog item in the action plan.

## Current direction (voice = the core product)
- **Provider:** **Gemini Live** (`gemini-3.1-flash-live-preview`), full-duplex WebSocket. Switchable via `platform_settings.voice_provider ∈ {gemini_live, pipeline, cartesia}` in Admin → Agents.
- **Mode:** **verbatim** narration. The agent reads the section text word-for-word; wraps its **own** words (remarks, questions, answers) in `((double parens))` → client shows book text **black**, agent asides **grey**. Progress bar + section states come from **one word-alignment pointer** over the verbatim text (asides/Q&A don't advance it).
- **Scope:** answers grounded in the **current chapter** only (full-book RAG is parked).
- Core voice files: `src/lib/geminiLive.js`, `src/components/GeminiLiveModal.jsx`, `supabase/functions/voice-session/` (the system prompt lives here).
- **Observability:** `geminiLive.js` emits structured events (`session_start`, `ws_open`, `go_away`, `ws_close {code, reason, durationMs, intentional}`, `reconnect_attempt`/`reconnect_success`, `server_error`, `session_end`…); `GeminiLiveModal` best-effort persists the key ones to the **`voice_events`** table (migration `005`) to debug why sessions drop. Query recipes: [docs/sql-queries.md](docs/sql-queries.md).
- **Reliability (shipped 2026-07-06, see DECISIONS A10/A11, C1):** (1) transcript bubbles no longer drop spoken words — fixed a render-layer tail-drop and cross-turn buffer resets; (2) long chapters survive the ~15-min socket via **session resumption + auto-reconnect** (resume handle + `slidingWindow` context compression; UI shows a friendly "Reconnecting…" countdown); (3) public `bookStore` now **lazy-loads** each book's `chapters` on BookDetail open, so the grid cold-load is light.
- **Next thread (scoped, not built — A12):** interruption/noise robustness — ambient-noise handling (VAD tuning + optional WASM denoise) first; **target-speaker** rejection (voiceprint enrollment + client-side speaker verification) is the larger, separate build.
- **AI-only pivot (in progress, 2026-07-07):** human-narrator/P2P removed (Phase A shipped). Admin now at **`/admin`**; whole-book **Gist** (AI summary) built but its **button is hidden pending Gemini billing** (item 36); mic capture on **AudioWorklet**; `profiles` RLS locked + `voice_provider` public-scoped read. See DECISIONS **D5, A13, A14, C4–C6**; action plan **24–36** (Phases B/C/D, Sarvam OCR, Gist re-enable pending).
- **Session history + rating:** every Talk/Gist session (all 3 providers) is durably recorded in **`voice_sessions`** (transcript + metadata) and ends with a mandatory 1-5★ + optional-text rating shown inline in the modal. See DECISIONS **A15** (migrations `008`/`009`).
- **Per-message thumbs up/down (shipped 2026-07-09, Gemini Live only):** each agent bubble in `GeminiLiveModal` has thumbs up/down; thumbs-down opens a remarks field that requires an explicit submit (Enter/send) before it commits — no autosave-on-keystroke — then collapses to a click-to-edit line. Stored on the message object itself, so it rides free in the same `voice_sessions.data.turns` write as A15 (no new table). **Pipeline/Cartesia modals don't have this yet** — parked. See DECISIONS **A16**.
- **Structured content model (shipped 2026-07-09, not yet used in voice):** EPUB parsing now produces rich **`blocks`** (headings, bold/italic/underline, real tables, images, inline SVG charts, sidebar/tip `role` tags) stored in **`book_content_blocks`** (own table, not nested in `books.chapters` — keeps it lean) + images in the **`book-assets`** Storage bucket. Goal is **conversational**, not visual — the agent will describe images/tables live via Gemini Live's multimodal `realtimeInput` when asked, no pre-baked AI captions. **Phase 3 (wiring this into `geminiLive.js` + the prompt) is not built yet** — blocks exist but nothing reads them in a session. See DECISIONS **B7–B10**.

## Key constraints (don't relearn the hard way)
- Gemini Live: **~3 concurrent sessions/key** on the Developer API → **Vertex AI (1,000/project)** for scale (still the true mass-usage wall; not addressed). **~10–15 min per WebSocket** → long chapters now **auto-resume** via session resumption + reconnect (A11), so this no longer kills a session.
- Verbatim chapter ≈ **$0.90** (~30 min audio, audio-output dominates). India WTP (~₹99–199 mass / ₹299–499 premium) sits near/below cost → pricing leans on concise-mode + credits.
- `books.chapters` is a JSONB blob (full text + nested sections); section numbers **restart per chapter** — never look them up by number across chapters. Keep it lean: rich structured content (`blocks`) lives in **`book_content_blocks`**, a separate table — nesting it back into `chapters` visibly slowed the admin Books tab (every book's chapters get eager-loaded there at once).
- Preview Gemini models change server-side without notice; "worked yesterday, no code change" → check git + reload before theorizing.

## Doc map
- **[docs/DECISIONS.md](docs/DECISIONS.md)** — the ADR decision log (the *why* behind every pivot). **Read this to understand how we got here.**
- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — current system: data model, stores, voice path, edge functions, flows.
- **[docs/design-language.html](docs/design-language.html)** — **brand & design language (v1)**: thesis, voice, and the token/type/component system that **governs every design decision**. Open in a browser (rendered page). Token changes are ADRs in DECISIONS.md.
- **[docs/system-field-guide.html](docs/system-field-guide.html)** — plain-language explainer of the whole system (browser, Gemini, memory, every parameter, glossary). Open in a browser.
- **[docs/sql-queries.md](docs/sql-queries.md)** — SQL runbook: voice-agent observability (`voice_events`), content health, users, sessions, ops. Run in Supabase SQL editor.
- **[docs/debugging-transcript-mismatches.md](docs/debugging-transcript-mismatches.md)** — focused runbook for "audio didn't match the speech-bubble text" reports; finds the exact session via `voice_sessions`/`voice_events` and lists the known causes.
- **[docs/pricing.md](docs/pricing.md)** · **[docs/unit-economics.md](docs/unit-economics.md)** · **[docs/voice-providers-comparison.md](docs/voice-providers-comparison.md)** — strategy & economics.
- **[action-plans/tender-conjuring-flurry.md](action-plans/tender-conjuring-flurry.md)** — the live voice-agent **action items / open threads** (verify verbatim, lossless re-split, generation params, Talk auth gate, RAG, etc.).
- `docs/older/` — earlier docs (PROJECT-STATUS, PERSONAS, PITCH-DECK, etc.); may be partly stale.

## Maintenance ritual (keep continuity alive)
At the end of a meaningful session: **append to `docs/DECISIONS.md`** any new decision (what/why/status), refresh this file's "Current direction / constraints" if they changed, update the action-items file, and update memory if the direction shifted. This is what keeps future conversations oriented.
