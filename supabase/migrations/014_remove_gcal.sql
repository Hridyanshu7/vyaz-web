-- Vyaz: remove Google Calendar integration (dead code, unused since human-narrator/P2P removal)
ALTER TABLE profiles DROP COLUMN IF EXISTS gcal_connected;
ALTER TABLE profiles DROP COLUMN IF EXISTS gcal_refresh_token;
ALTER TABLE sessions DROP COLUMN IF EXISTS google_calendar_event_id;
