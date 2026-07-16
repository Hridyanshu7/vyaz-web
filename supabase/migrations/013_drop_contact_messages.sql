-- Vyaz: drop contact_messages — the "Get in touch" form was removed in favor of a
-- floating WhatsApp button (direct chat, no stored submissions). Table was empty.

DROP TABLE IF EXISTS contact_messages;
