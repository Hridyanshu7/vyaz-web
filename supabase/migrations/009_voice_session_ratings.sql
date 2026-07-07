-- 009_voice_session_ratings.sql
-- Add a mandatory-in-UI 1-5 star rating + optional free-text remark to voice_sessions —
-- one Uber-style rating prompt per session, across all three voice providers. Both
-- columns are nullable at the DB level (a session record can exist before it's rated;
-- the "mandatory" part is enforced in the UI, not the schema).
--
-- No new RLS: the existing "users manage own voice_sessions" policy (FOR ALL, migration
-- 008) already covers UPDATEs to these new columns on the owner's own row; admins
-- already have read access via "admins read voice_sessions".

alter table voice_sessions
  add column if not exists rating smallint check (rating between 1 and 5),
  add column if not exists feedback_text text;
