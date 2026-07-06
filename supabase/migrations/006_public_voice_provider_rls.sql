-- 006_public_voice_provider_rls.sql
-- Expose ONLY the non-secret `voice_provider` setting to the public, so the Talk button
-- resolves the correct voice provider for non-admin / logged-out users too.
--
-- Context: platform_settings holds secrets (gemini_api_key, ...) and is protected by an
-- existing "Admin only" policy (FOR ALL, USING profiles.is_admin). Because each setting is
-- its own key/value ROW, a scoped SELECT policy can safely expose just the voice_provider
-- row while every secret row stays admin-only. RLS combines permissive policies with OR:
--   admins  -> see all rows (Admin only policy)
--   anon/others -> see only the voice_provider row (this policy)
-- Edge functions use the service-role key and bypass RLS, so they are unaffected.
--
-- Applied in the Supabase SQL editor on 2026-07-06; recorded here for versioning.

drop policy if exists "public can read voice_provider" on public.platform_settings;
create policy "public can read voice_provider"
  on public.platform_settings for select
  to anon, authenticated
  using (key = 'voice_provider');
