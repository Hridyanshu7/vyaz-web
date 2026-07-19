// Whole-book chapter-span context: one short line per chapter, generated once per book (and
// cached in the useLiveSession hook's ref, not persisted to the DB) so jump_to_chapter can
// resolve a topic ("go to the chapter about pricing") against something real instead of
// guessing blind. A single REST call to Gemini's normal (non-Live) generateContent endpoint —
// not the Live WebSocket — using the same API key the voice-session edge function hands back.
const GENERATE_URL = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`

// Keep the request small: title + first ~400 chars of narratable content per chapter is
// plenty for a one-line summary, and a whole book's worth of full chapter text would be
// wasteful (and risk the model's input limits for very long books).
function chapterExcerpt(chapter) {
  const text = (chapter.content || (chapter.sections || []).map((s) => s.text).join(' ') || '').slice(0, 400)
  return `Chapter ${chapter.number}: "${chapter.title}"\n${text}`
}

export async function generateChapterOneliners(chapters, geminiApiKey, model = 'gemini-2.5-flash') {
  if (!chapters?.length) return {}
  const prompt =
    'For each chapter below, write ONE short line (under 15 words) summarizing what it covers. ' +
    'Reply with ONLY a JSON object mapping chapter number (as a string) to its one-liner, nothing else.\n\n' +
    chapters.map(chapterExcerpt).join('\n\n')

  const res = await fetch(`${GENERATE_URL(model)}?key=${geminiApiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
    }),
  })
  if (!res.ok) throw new Error(`generateContent failed: ${res.status}`)
  const data = await res.json()
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
  try {
    return JSON.parse(raw)
  } catch {
    return {} // best-effort — a malformed response just means no chapter-list context this session
  }
}

// Compact "N. Title — oneliner" block for the {chapter_list} prompt placeholder.
export function formatChapterList(chapters, oneliners) {
  return (chapters || [])
    .map((c) => `${c.number}. ${c.title}${oneliners[c.number] ? ` — ${oneliners[c.number]}` : ''}`)
    .join('\n')
}
