-- 015_authors.sql
-- Authors DB: admin-managed author records, many-to-many with books, auto-populated
-- as books are added. books.author (free text) is untouched — this is additive.

create table if not exists authors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  bio text,
  photo_url text,
  created_at timestamptz not null default now()
);

-- Case-insensitive dedup: the ON CONFLICT target for auto-create-on-book-insert below.
create unique index if not exists idx_authors_name_ci on authors (lower(name));

create table if not exists book_authors (
  book_id uuid not null references public.books(id) on delete cascade,
  author_id uuid not null references public.authors(id) on delete cascade,
  primary key (book_id, author_id)
);

create index if not exists idx_book_authors_author on book_authors(author_id);

alter table authors enable row level security;
alter table book_authors enable row level security;

drop policy if exists "public read authors" on authors;
create policy "public read authors" on authors
  for select to anon, authenticated using (true);

drop policy if exists "admins manage authors" on authors;
create policy "admins manage authors" on authors
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "public read book_authors" on book_authors;
create policy "public read book_authors" on book_authors
  for select to anon, authenticated using (true);

drop policy if exists "admins manage book_authors" on book_authors;
create policy "admins manage book_authors" on book_authors
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Author photo storage bucket (created here in SQL, unlike book-assets which was created
-- via the dashboard — keeps this migration self-contained).
insert into storage.buckets (id, name, public)
values ('author-photos', 'author-photos', true)
on conflict (id) do nothing;

drop policy if exists "admins manage author-photos" on storage.objects;
create policy "admins manage author-photos" on storage.objects
  for all
  to authenticated
  using (bucket_id = 'author-photos' and public.is_admin())
  with check (bucket_id = 'author-photos' and public.is_admin());

drop policy if exists "public read author-photos" on storage.objects;
create policy "public read author-photos" on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'author-photos');

-- Core sync logic, shared by the trigger (new/edited books) and the one-time backfill
-- below (existing books). security definer so it works regardless of which role fires
-- it — there's no admin INSERT/UPDATE policy on `books` captured in any migration file
-- (it was applied ad hoc in the SQL editor, per the note in 007_lock_profiles_rls.sql),
-- so this can't safely assume the firing role already has write access to authors/book_authors.
create or replace function public.sync_book_authors(p_book_id uuid, p_author_text text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  raw_name text;
  clean_name text;
  aid uuid;
begin
  if p_author_text is null or btrim(p_author_text) = '' then
    return;
  end if;

  -- Defensive split for "A, B" / "A & B" / "A and B" strings. Real data today is always
  -- a single clean name, but future book adds may carry co-author strings.
  foreach raw_name in array regexp_split_to_array(p_author_text, '\s*(,|&|\sand\s)\s*') loop
    clean_name := btrim(raw_name);
    continue when clean_name = '';

    insert into public.authors (name)
    values (clean_name)
    on conflict ((lower(name))) do nothing;

    select id into aid from public.authors where lower(name) = lower(clean_name) limit 1;

    if aid is not null then
      insert into public.book_authors (book_id, author_id)
      values (p_book_id, aid)
      on conflict do nothing;
    end if;
  end loop;
end;
$$;

create or replace function public.link_book_authors()
returns trigger
language plpgsql
as $$
begin
  perform public.sync_book_authors(NEW.id, NEW.author);
  return NEW;
end;
$$;

drop trigger if exists on_book_insert_or_author_change on books;
create trigger on_book_insert_or_author_change
  after insert or update of author on books
  for each row
  execute function public.link_book_authors();

-- One-time backfill for books that already existed before this migration.
do $$
declare
  b record;
begin
  for b in select id, author from public.books where author is not null and btrim(author) <> '' loop
    perform public.sync_book_authors(b.id, b.author);
  end loop;
end;
$$;
