-- Add a language column to books (used by addBook insert in src/stores/bookStore.js).
-- publisher / pub_date were phantom fields (never real columns) and have been removed
-- from the insert + the BookDetail display, so no columns are added for them.
ALTER TABLE books ADD COLUMN IF NOT EXISTS language text;
