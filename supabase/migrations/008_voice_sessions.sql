-- 008_voice_sessions.sql
-- Durable per-session history: ONE ROW per Talk/Gist session, holding a JSON blob of
-- session metadata + the full turn-by-turn transcript, mapped to user/book/chapter/time.
-- Shared across ALL THREE voice providers (gemini_live, pipeline, cartesia).
--
-- Distinct from existing tables:
--   voice_events   — granular technical event log (ws_close, reconnect...), for debugging.
--   voice_progress — legacy LIVE progress-bar state for pipeline/cartesia only; Gemini
--                    Live never wrote to it. Left as-is; not superseded by this table.
-- This table is the durable "session history" record: general enough to serve either a
-- user-facing "continue listening" view or admin analytics later.

create table if not exists voice_sessions (
  id bigint generated always as identity primary key,
  session_id text not null,
  user_id uuid references auth.users(id) on delete set null,
  book_id uuid references public.books(id) on delete cascade,
  chapter_number int,                    -- null for gist (whole-book) sessions
  mode text not null default 'chapter',  -- 'chapter' | 'gist'
  provider text not null,                -- 'gemini_live' | 'pipeline' | 'cartesia'
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  data jsonb not null default '{}'::jsonb, -- { meta: {...provider-specific}, turns: [{role,text},...] }
  created_at timestamptz not null default now()
);

create index if not exists idx_voice_sessions_session_id on voice_sessions(session_id);
create index if not exists idx_voice_sessions_user on voice_sessions(user_id);
create index if not exists idx_voice_sessions_book on voice_sessions(book_id, chapter_number);
create index if not exists idx_voice_sessions_started on voice_sessions(started_at desc);

alter table voice_sessions enable row level security;

-- Users manage (insert/select/update) only their own session records.
drop policy if exists "users manage own voice_sessions" on voice_sessions;
create policy "users manage own voice_sessions" on voice_sessions
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Admins can read all session records (analytics / support).
drop policy if exists "admins read voice_sessions" on voice_sessions;
create policy "admins read voice_sessions" on voice_sessions
  for select to authenticated
  using (public.is_admin());
