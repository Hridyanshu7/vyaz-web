import { supabase } from './supabase'

// Records a durable session entry in `voice_sessions` — one row per session, holding
// metadata + the full turn-by-turn transcript. Shared across all three voice providers
// (Gemini Live, pipeline, Cartesia) so session history works the same regardless of which
// is active. Best-effort (swallow errors) — matches voice_events' convention: a DB hiccup
// must never break the voice UX.

export async function startVoiceSessionRecord({ sessionId, userId, bookId, chapterNumber, mode, provider }) {
  if (!sessionId || !userId) return
  try {
    await supabase.from('voice_sessions').insert({
      session_id: sessionId,
      user_id: userId,
      book_id: bookId,
      chapter_number: chapterNumber ?? null,
      mode: mode || 'chapter',
      provider,
    })
  } catch { /* best-effort */ }
}

export async function endVoiceSessionRecord({ sessionId, userId, turns, meta }) {
  if (!sessionId || !userId) return
  try {
    await supabase.from('voice_sessions')
      .update({
        ended_at: new Date().toISOString(),
        data: { meta: meta || {}, turns: turns || [] },
      })
      .eq('session_id', sessionId)
      .eq('user_id', userId)
  } catch { /* best-effort */ }
}

// Separate, small follow-up write for the post-session star rating + optional remark —
// deliberately NOT bundled into endVoiceSessionRecord. If the user abandons the tab on the
// mandatory rating screen, the transcript/ended_at (already saved above) survives; only the
// rating itself would be missing.
export async function submitSessionRating({ sessionId, userId, rating, feedbackText }) {
  if (!sessionId || !userId || !rating) return
  try {
    await supabase.from('voice_sessions')
      .update({ rating, feedback_text: feedbackText || null })
      .eq('session_id', sessionId)
      .eq('user_id', userId)
  } catch { /* best-effort */ }
}
