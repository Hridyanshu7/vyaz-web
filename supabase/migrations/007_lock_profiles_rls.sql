-- 007_lock_profiles_rls.sql
-- Close the profiles PII leak (anon could read every profile incl. email via a
-- "Public profiles" SELECT policy with qual=true — a leftover from the removed public
-- narrator directory). Post-pivot nothing needs public profile reads.
--
-- The admin check uses a SECURITY DEFINER helper so a policy on profiles can test admin
-- status WITHOUT re-reading profiles under RLS (an inline EXISTS caused 42P17 recursion
-- once the permissive "Public profiles" policy was removed).
--
-- Applied in the Supabase SQL editor on 2026-07-06; recorded here for versioning.

-- Admin check that bypasses RLS on its inner read (breaks the recursion)
create or replace function public.is_admin()
  returns boolean language sql security definer stable
  set search_path = public
as $$ select exists (select 1 from public.profiles where id = auth.uid() and is_admin) $$;

-- Rebuild profiles SELECT policies: own-profile + admins, no public read
drop policy if exists "Public profiles"          on public.profiles;
drop policy if exists "Users read own profile"   on public.profiles;
drop policy if exists "Admins read all profiles" on public.profiles;

create policy "Users read own profile" on public.profiles
  for select to authenticated using (auth.uid() = id);

create policy "Admins read all profiles" on public.profiles
  for select to authenticated using (public.is_admin());

-- Switch the admin UPDATE policy to the helper too (same recursion risk)
drop policy if exists "Admins update any profile" on public.profiles;
create policy "Admins update any profile" on public.profiles
  for update to authenticated using (public.is_admin());
