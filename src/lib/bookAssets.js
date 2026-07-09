import { supabase } from './supabase'

// Book images (extracted from EPUBs) live in this public Supabase Storage bucket, one
// folder per book: book-assets/<bookId>/<path-from-the-epub-zip>. The bucket itself must
// be created once via the Supabase dashboard (Storage → New bucket → "book-assets",
// public) — there's no SQL migration for Storage buckets.
const BUCKET = 'book-assets'

// Upload one image extracted from an EPUB and return its public URL. Best-effort: a
// failed upload (e.g. the bucket doesn't exist yet) returns null rather than throwing,
// so one bad/missing asset never breaks the rest of the parse.
export async function uploadBookAsset(bookId, zipPath, bytes, mimeType) {
  if (!bookId || !zipPath || !bytes) return null
  try {
    const safePath = zipPath.replace(/[^a-zA-Z0-9/._-]/g, '_')
    const path = `${bookId}/${safePath}`
    const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
      contentType: mimeType || 'image/jpeg',
      upsert: true, // re-parsing the same book overwrites rather than failing/duplicating
    })
    if (error) { console.error('[bookAssets] upload failed:', error.message); return null }
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
    return data?.publicUrl || null
  } catch (err) {
    console.error('[bookAssets] upload error:', err.message)
    return null
  }
}

// Remove every asset for a book (called from book-delete) so deleting a book doesn't
// leave orphaned images in storage.
export async function deleteBookAssets(bookId) {
  if (!bookId) return
  try {
    const { data: files } = await supabase.storage.from(BUCKET).list(bookId, { limit: 1000 })
    if (files?.length) {
      await supabase.storage.from(BUCKET).remove(files.map((f) => `${bookId}/${f.name}`))
    }
  } catch (err) {
    console.error('[bookAssets] cleanup error:', err.message)
  }
}
