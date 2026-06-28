-- Vyaz P2P: Initial Schema

-- Enums
CREATE TYPE user_role AS ENUM ('reader', 'narrator', 'both');
CREATE TYPE booking_status AS ENUM ('pending', 'confirmed', 'completed', 'cancelled');

-- Profiles (extends auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  avatar_url TEXT,
  bio TEXT,
  role user_role DEFAULT 'reader',
  genres TEXT[] DEFAULT '{}',
  onboarding_complete BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Books catalog
CREATE TABLE books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  cover_url TEXT,
  description TEXT,
  genre TEXT,
  page_count INTEGER,
  isbn TEXT,
  amazon_data JSONB,
  goodreads_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Narrator-book relationships
CREATE TABLE narrator_books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  narrator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(narrator_id, book_id)
);

-- Narrator availability slots
CREATE TABLE availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  narrator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  timezone TEXT DEFAULT 'UTC',
  calendly_link TEXT,
  CHECK (start_time < end_time)
);

-- Bookings
CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reader_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  narrator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER DEFAULT 30,
  status booking_status DEFAULT 'pending',
  meeting_link TEXT,
  google_calendar_event_id TEXT,
  calendly_event_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Reviews
CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  narrator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(booking_id)
);

-- Indexes
CREATE INDEX idx_narrator_books_book ON narrator_books(book_id);
CREATE INDEX idx_narrator_books_narrator ON narrator_books(narrator_id);
CREATE INDEX idx_availability_narrator ON availability(narrator_id);
CREATE INDEX idx_bookings_reader ON bookings(reader_id);
CREATE INDEX idx_bookings_narrator ON bookings(narrator_id);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_reviews_narrator ON reviews(narrator_id);

-- Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE books ENABLE ROW LEVEL SECURITY;
ALTER TABLE narrator_books ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- Profiles: anyone can read, users update own
CREATE POLICY "Public profiles" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Books: public read
CREATE POLICY "Public books" ON books FOR SELECT USING (true);

-- Narrator books: public read, narrators manage own
CREATE POLICY "Public narrator_books" ON narrator_books FOR SELECT USING (true);
CREATE POLICY "Narrators manage own books" ON narrator_books FOR ALL USING (auth.uid() = narrator_id);

-- Availability: public read, narrators manage own
CREATE POLICY "Public availability" ON availability FOR SELECT USING (true);
CREATE POLICY "Narrators manage own availability" ON availability FOR ALL USING (auth.uid() = narrator_id);

-- Bookings: participants can see own
CREATE POLICY "Participants view bookings" ON bookings FOR SELECT
  USING (auth.uid() = reader_id OR auth.uid() = narrator_id);
CREATE POLICY "Readers create bookings" ON bookings FOR INSERT
  WITH CHECK (auth.uid() = reader_id);
CREATE POLICY "Participants update bookings" ON bookings FOR UPDATE
  USING (auth.uid() = reader_id OR auth.uid() = narrator_id);

-- Reviews: public read, reviewer creates
CREATE POLICY "Public reviews" ON reviews FOR SELECT USING (true);
CREATE POLICY "Reviewers create reviews" ON reviews FOR INSERT
  WITH CHECK (auth.uid() = reviewer_id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id) VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();
