-- 017_book_requests_status_default.sql
-- Ensure anonymous/any inserts that omit `status` land as 'pending' — the admin
-- panel only lists rows where status = 'pending', so a missing default makes
-- new requests invisible. Also backfills any rows that already landed with a
-- null status, and prints diagnostics (visible in `db push` output).

do $$
declare
  col_default text;
  n_null int;
  n_pending int;
  r record;
begin
  select column_default into col_default
  from information_schema.columns
  where table_schema = 'public' and table_name = 'book_requests' and column_name = 'status';
  raise notice 'book_requests.status default BEFORE: %', coalesce(col_default, 'NONE');

  select count(*) filter (where status is null),
         count(*) filter (where status = 'pending')
    into n_null, n_pending
  from public.book_requests;
  raise notice 'rows with null status: %, pending: %', n_null, n_pending;

  for r in
    select book_title, status, user_id is null as anon, created_at
    from public.book_requests
    order by created_at desc
    limit 8
  loop
    raise notice 'row: % | status=% | anon=% | %', r.book_title, r.status, r.anon, r.created_at;
  end loop;
end $$;

alter table public.book_requests alter column status set default 'pending';

update public.book_requests set status = 'pending' where status is null;
