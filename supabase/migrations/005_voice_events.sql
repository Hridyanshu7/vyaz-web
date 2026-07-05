-- Observability for the Gemini Live voice agent.
-- Written best-effort from the client (GeminiLiveModal onEvent) for key events:
-- session_start, setup_complete, go_away, ws_close, ws_error, server_error, session_end.

create table if not exists voice_events (
  id bigint generated always as identity primary key,
  session_id text,
  user_id uuid default auth.uid() references auth.users(id) on delete set null,
  book_id uuid,
  chapter_number int,
  type text not null,
  detail jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_voice_events_session on voice_events(session_id);
create index if not exists idx_voice_events_type on voice_events(type);
create index if not exists idx_voice_events_created on voice_events(created_at desc);

alter table voice_events enable row level security;

-- Authenticated users can log their own events (user_id auto-fills via the column default).
create policy "auth insert voice_events" on voice_events
  for insert to authenticated with check (true);

-- Admins can read all events for debugging.
create policy "admin read voice_events" on voice_events
  for select to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin));
