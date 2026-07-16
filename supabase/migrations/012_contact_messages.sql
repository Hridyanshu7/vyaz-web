-- Vyaz: Contact form submissions ("Get in touch" section on Home)

CREATE TABLE contact_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact TEXT NOT NULL,   -- email or WhatsApp number, free text (single field, either works)
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE contact_messages ENABLE ROW LEVEL SECURITY;

-- Anyone, signed in or not, can submit the contact form — it's a public "Get in touch" form.
CREATE POLICY "Anyone can submit a contact message"
  ON contact_messages FOR INSERT
  WITH CHECK (true);

-- No public SELECT/UPDATE/DELETE policy — messages are only readable via the service
-- role (Supabase SQL editor / a future Admin panel view), not exposed to the client.
