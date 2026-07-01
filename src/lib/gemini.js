import { supabase } from './supabase'

const MODEL = 'gemini-2.5-flash'

async function getSettings() {
  const { data } = await supabase
    .from('platform_settings')
    .select('key, value')
    .in('key', ['gemini_api_key', 'gemini_chapters_prompt'])

  const map = {}
  ;(data || []).forEach((r) => { map[r.key] = r.value })
  return map
}

async function callGemini(apiKey, prompt) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1 },
      }),
    }
  )
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  let text = data.candidates[0].content.parts[0].text.trim()
  text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  return JSON.parse(text)
}

// Sample a chapter to capture its arc without sending full content:
// first paragraph + first sentence of each section + last paragraph
function sampleChapter(chapter) {
  const content = (chapter.content || '').trim()
  if (!content) return ''

  const paragraphs = content.split(/\n{2,}/).map((p) => p.trim()).filter((p) => p.length > 20)
  if (paragraphs.length === 0) return ''

  const firstPara = paragraphs[0]
  const lastPara = paragraphs.length > 1 ? paragraphs[paragraphs.length - 1] : ''

  // If sections exist, take the first sentence of each section
  const sections = chapter.sections || []
  if (sections.length > 0) {
    const sectionOpeners = sections.map((s) => {
      const text = (s.text || '').trim()
      const match = text.match(/^.+?[.!?](?:\s|$)/)
      return match ? match[0].trim() : text.slice(0, 120)
    }).filter(Boolean)

    return [firstPara, `[Arc]: ${sectionOpeners.join(' … ')}`, lastPara]
      .filter(Boolean).join('\n\n')
  }

  // No sections — sample paragraphs evenly through the content
  const step = Math.max(1, Math.floor(paragraphs.length / 5))
  const middle = paragraphs
    .filter((_, i) => i > 0 && i < paragraphs.length - 1 && i % step === 0)
    .slice(0, 4)
    .map((p) => p.split(/[.!?]\s/)[0] + '.')

  return [firstPara, ...middle, lastPara].filter(Boolean).join('\n\n')
}

// Generate chapters + oneliners from scratch (no EPUB content)
export async function generateChapters(title, author) {
  const settings = await getSettings()
  const apiKey = settings.gemini_api_key || import.meta.env.VITE_GEMINI_API_KEY
  if (!apiKey) throw new Error('Gemini API key not set. Add it in Admin → Agents → Gemini → Secrets.')

  const promptTemplate = settings.gemini_chapters_prompt || ''
  const prompt = promptTemplate.replace('{title}', title).replace('{author}', author)

  const chapters = await callGemini(apiKey, prompt)
  if (!Array.isArray(chapters)) throw new Error('Invalid response format')
  return chapters
}

// Generate oneliners using sampled content (first para + section openers + last para)
export async function generateOneliners(title, author, chapters) {
  const settings = await getSettings()
  const apiKey = settings.gemini_api_key || import.meta.env.VITE_GEMINI_API_KEY
  if (!apiKey) throw new Error('Gemini API key not set. Add it in Admin → Agents → Gemini → Secrets.')

  const chapterList = chapters.map((ch) => {
    const sample = sampleChapter(ch)
    return `Chapter ${ch.number}: "${ch.title}"\n${sample}`
  }).join('\n\n---\n\n')

  const prompt = `You are reading "${title}" by ${author}.

For each chapter below, write a single sentence that captures its core idea. Base it on the sampled content: the opening paragraph, the arc through section openers, and the closing paragraph.

${chapterList}

Return ONLY a valid JSON array with no markdown:
[{"number":1,"oneliner":"One sentence capturing the chapter's core idea."}]`

  const result = await callGemini(apiKey, prompt)
  if (!Array.isArray(result)) throw new Error('Invalid response format')
  return result
}
