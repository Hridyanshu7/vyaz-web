-- 010_book_content_blocks.sql
-- Structured content blocks (headings/paragraphs-with-marks/lists/tables/images) live in
-- their OWN table, one row per (book, chapter) — NOT nested inside books.chapters.
--
-- Why separate: books.chapters already gets rewritten wholesale on every Split/Generate/
-- Regen. Blocks are far more verbose JSON than the old flat content string (every
-- paragraph is now a spans array, every image carries assetUrl/alt/caption/page), and
-- expected to be common across many titles at real density (lots of images/tables/charts).
-- Nesting that inside books.chapters would mean EVERY unrelated write/read of a book's
-- chapters (including the admin catalog listing, which eagerly loads all books' chapters
-- at once) pays the cost of shuttling the full blocks payload even when blocks was never
-- touched. A dedicated per-chapter table keeps books.chapters lean permanently, and lets
-- any future consumer (e.g. the live voice session) fetch just the one chapter it needs.

create table if not exists book_content_blocks (
  book_id uuid not null references public.books(id) on delete cascade,
  chapter_number int not null,
  blocks jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (book_id, chapter_number)
);

create index if not exists idx_book_content_blocks_book on book_content_blocks(book_id);

alter table book_content_blocks enable row level security;

-- Public read — blocks are book content, same sensitivity as books.chapters itself
-- (already publicly readable; every visitor sees a book's chapters on its detail page).
drop policy if exists "public read book_content_blocks" on book_content_blocks;
create policy "public read book_content_blocks" on book_content_blocks
  for select to anon, authenticated
  using (true);

-- Admins manage writes (produced by the EPUB-parsing admin action).
drop policy if exists "admins manage book_content_blocks" on book_content_blocks;
create policy "admins manage book_content_blocks" on book_content_blocks
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
