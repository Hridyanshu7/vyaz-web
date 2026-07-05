# Vyaz — Project Brief (start here)

_Auto-loaded every session. Keep this concise — it's a map + current-state, not the full story. Deep context lives in the docs linked below._

## What Vyaz is
A P2P **book-knowledge marketplace** where readers **"talk to books"** — an AI voice agent narrates a chapter **verbatim** and answers questions — plus human narrator sessions (1:1 / group). Target: **premium learners in India** (AI study companion).

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
- **Observability:** `geminiLive.js` emits structured events (`session_start`, `ws_open`, `go_away`, `ws_close {code, reason, durationMs, intentional}`, `server_error`, `session_end`…); `GeminiLiveModal` best-effort persists the key ones to the **`voice_events`** table (migration `005`) to debug why sessions drop. Query recipes: [docs/sql-queries.md](docs/sql-queries.md).

## Key constraints (don't relearn the hard way)
- Gemini Live: **~3 concurrent sessions/key** on the Developer API → **Vertex AI (1,000/project)** for scale. **~10–15 min per WebSocket** → long chapters need session resumption (not built).
- Verbatim chapter ≈ **$0.90** (~30 min audio, audio-output dominates). India WTP (~₹99–199 mass / ₹299–499 premium) sits near/below cost → pricing leans on concise-mode + credits.
- `books.chapters` is a JSONB blob (full text + nested sections); section numbers **restart per chapter** — never look them up by number across chapters.
- Preview Gemini models change server-side without notice; "worked yesterday, no code change" → check git + reload before theorizing.

## Doc map
- **[docs/DECISIONS.md](docs/DECISIONS.md)** — the ADR decision log (the *why* behind every pivot). **Read this to understand how we got here.**
- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — current system: data model, stores, voice path, edge functions, flows.
- **[docs/sql-queries.md](docs/sql-queries.md)** — SQL runbook: voice-agent observability (`voice_events`), content health, users, sessions, ops. Run in Supabase SQL editor.
- **[docs/pricing.md](docs/pricing.md)** · **[docs/unit-economics.md](docs/unit-economics.md)** · **[docs/voice-providers-comparison.md](docs/voice-providers-comparison.md)** — strategy & economics.
- **[action-plans/tender-conjuring-flurry.md](action-plans/tender-conjuring-flurry.md)** — the live voice-agent **action items / open threads** (verify verbatim, lossless re-split, generation params, Talk auth gate, RAG, etc.).
- `docs/older/` — earlier docs (PROJECT-STATUS, PERSONAS, PITCH-DECK, etc.); may be partly stale.

## Maintenance ritual (keep continuity alive)
At the end of a meaningful session: **append to `docs/DECISIONS.md`** any new decision (what/why/status), refresh this file's "Current direction / constraints" if they changed, update the action-items file, and update memory if the direction shifted. This is what keeps future conversations oriented.
