-- 011_book_assets_storage_rls.sql
-- Fix "new row violates row-level security policy" on EPUB image uploads.
--
-- Making a Storage bucket "public" in the dashboard only controls READ access. Writes
-- (uploads) are governed separately by RLS on Supabase's internal storage.objects table,
-- which — like any RLS-enabled table — denies everything until an explicit policy grants
-- it. The book-assets bucket was created public-for-read but never given an upload policy.

-- Admins can upload/overwrite/delete objects in the book-assets bucket (EPUB parsing
-- runs from the Admin panel, authenticated as an admin).
drop policy if exists "admins manage book-assets" on storage.objects;
create policy "admins manage book-assets" on storage.objects
  for all
  to authenticated
  using (bucket_id = 'book-assets' and public.is_admin())
  with check (bucket_id = 'book-assets' and public.is_admin());

-- Public read (explicit, so it doesn't depend on however the dashboard's "public bucket"
-- toggle implements read access under the hood).
drop policy if exists "public read book-assets" on storage.objects;
create policy "public read book-assets" on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'book-assets');
