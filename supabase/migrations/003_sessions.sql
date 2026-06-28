-- Vyaz: Sessions model (1:1 + group) + session requests

-- Enums
CREATE TYPE session_type AS ENUM ('one_on_one', 'group');
CREATE TYPE session_status AS ENUM ('scheduled', 'open', 'full', 'completed', 'cancelled');
CREATE TYPE attendee_status AS ENUM ('registered', 'attended', 'cancelled');
CREATE TYPE request_status AS ENUM ('pending', 'matched', 'expired');

-- Sessions (replaces bookings as primary unit)
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  narrator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  type session_type NOT NULL DEFAULT 'one_on_one',
  status session_status DEFAULT 'scheduled',
  title TEXT,
  description TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER DEFAULT 30,
  max_attendees INTEGER DEFAULT 1,
  meeting_link TEXT,
  google_calendar_event_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Session attendees (who's joining)
CREATE TABLE session_attendees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  reader_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status attendee_status DEFAULT 'registered',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(session_id, reader_id)
);

-- Session requests (listener demand)
CREATE TABLE session_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reader_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  preferred_type session_type DEFAULT 'group',
  message TEXT,
  status request_status DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_sessions_narrator ON sessions(narrator_id);
CREATE INDEX idx_sessions_book ON sessions(book_id);
CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_sessions_scheduled ON sessions(scheduled_at);
CREATE INDEX idx_attendees_session ON session_attendees(session_id);
CREATE INDEX idx_attendees_reader ON session_attendees(reader_id);
CREATE INDEX idx_requests_book ON session_requests(book_id);
CREATE INDEX idx_requests_reader ON session_requests(reader_id);

-- RLS
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_attendees ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_requests ENABLE ROW LEVEL SECURITY;

-- Sessions: public read, narrator manages own
CREATE POLICY "Public sessions" ON sessions FOR SELECT USING (true);
CREATE POLICY "Narrator creates sessions" ON sessions FOR INSERT
  WITH CHECK (auth.uid() = narrator_id);
CREATE POLICY "Narrator updates own sessions" ON sessions FOR UPDATE
  USING (auth.uid() = narrator_id);

-- Attendees: public read (for counts), readers join/leave
CREATE POLICY "Public attendees" ON session_attendees FOR SELECT USING (true);
CREATE POLICY "Readers join sessions" ON session_attendees FOR INSERT
  WITH CHECK (auth.uid() = reader_id);
CREATE POLICY "Readers leave sessions" ON session_attendees FOR UPDATE
  USING (auth.uid() = reader_id);

-- Requests: readers create, public read (narrators need to see demand)
CREATE POLICY "Public requests" ON session_requests FOR SELECT USING (true);
CREATE POLICY "Readers create requests" ON session_requests FOR INSERT
  WITH CHECK (auth.uid() = reader_id);
CREATE POLICY "Readers update own requests" ON session_requests FOR UPDATE
  USING (auth.uid() = reader_id);

-- Link reviews to sessions
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES sessions(id);
