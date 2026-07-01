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

// Generate chapters + oneliners from scratch (no EPUB content)
export async function generateChapters(title, author) {
  const settings = await getSettings()
  const apiKey = settings.gemini_api_key || import.meta.env.VITE_GEMINI_API_KEY
  if (!apiKey) throw new Error('Gemini API key not set. Add it in Admin → Chapters → Settings.')

  const promptTemplate = settings.gemini_chapters_prompt || ''
  const prompt = promptTemplate.replace('{title}', title).replace('{author}', author)

  const chapters = await callGemini(apiKey, prompt)
  if (!Array.isArray(chapters)) throw new Error('Invalid response format')
  return chapters
}

// Generate oneliners grounded in actual chapter content (post-EPUB upload)
export async function generateOneliners(title, author, chapters) {
  const settings = await getSettings()
  const apiKey = settings.gemini_api_key || import.meta.env.VITE_GEMINI_API_KEY
  if (!apiKey) throw new Error('Gemini API key not set. Add it in Admin → Chapters → Settings.')

  const chapterList = chapters.map((ch) => {
    const excerpt = (ch.content || '').slice(0, 800).replace(/\n+/g, ' ').trim()
    return `Chapter ${ch.number}: "${ch.title}"\nExcerpt: ${excerpt}`
  }).join('\n\n')

  const prompt = `You are reading "${title}" by ${author}.

Below are the chapters with excerpts from the actual text. For each chapter, write a one-liner that captures the core idea based on the content provided.

${chapterList}

Return ONLY a valid JSON array with no markdown:
[{"number":1,"oneliner":"One sentence grounded in the actual content."}]`

  const result = await callGemini(apiKey, prompt)
  if (!Array.isArray(result)) throw new Error('Invalid response format')
  return result
}
