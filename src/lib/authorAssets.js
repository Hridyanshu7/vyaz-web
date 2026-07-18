import { supabase } from './supabase'

// Author profile photos, one file per author: author-photos/<authorId>/photo.<ext>.
// Bucket is created + RLS'd in supabase/migrations/015_authors.sql.
const BUCKET = 'author-photos'

// Upload a photo for an author and return its public URL. Best-effort: a failed upload
// returns null rather than throwing. upsert:true means re-uploading overwrites the same
// path, so the returned URL is cache-busted to avoid the browser showing a stale image.
export async function uploadAuthorPhoto(authorId, file) {
  if (!authorId || !file) return null
  try {
    const ext = (file.name.split('.').pop() || 'jpg').replace(/[^a-zA-Z0-9]/g, '') || 'jpg'
    const path = `${authorId}/photo.${ext}`
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      contentType: file.type || 'image/jpeg',
      upsert: true,
    })
    if (error) { console.error('[authorAssets] upload failed:', error.message); return null }
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
    return data?.publicUrl ? `${data.publicUrl}?v=${Date.now()}` : null
  } catch (err) {
    console.error('[authorAssets] upload error:', err.message)
    return null
  }
}
