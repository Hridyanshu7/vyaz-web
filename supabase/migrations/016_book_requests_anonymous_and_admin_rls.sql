-- 016_book_requests_anonymous_and_admin_rls.sql
-- book_requests was created ad hoc in the SQL editor and never captured in a
-- migration. Two bugs traced to its RLS:
--   1. No UPDATE policy → admin Approve/Reject silently matched 0 rows, so
--      "rejected" requests reappeared as pending on the next load.
--   2. user_id was NOT NULL + insert tied to auth.uid() → signed-out visitors
--      could not file a request at all (auth is optional everywhere, C9).
-- This migration makes user_id nullable, and rebuilds the policy set from
-- scratch (drops whatever ad-hoc policies exist, names unknown → dynamic drop).

alter table public.book_requests alter column user_id drop not null;

do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'book_requests'
  loop
    execute format('drop policy %I on public.book_requests', p.policyname);
  end loop;
end $$;

alter table public.book_requests enable row level security;

-- Signed-out visitors file anonymously (user_id must stay null — they can't
-- impersonate a real user).
create policy "anon insert requests" on public.book_requests
  for insert to anon
  with check (user_id is null);

-- Signed-in users file as themselves.
create policy "users insert own requests" on public.book_requests
  for insert to authenticated
  with check (user_id = auth.uid());

-- Requesters see their own; admins see all (powers the admin Requested tab).
create policy "read own or admin reads all" on public.book_requests
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Approve/Reject from the admin panel.
create policy "admins update requests" on public.book_requests
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());
