import { supabase } from './supabase'

const MODEL = 'gemini-2.0-flash'

async function getSettings() {
  const { data } = await supabase
    .from('platform_settings')
    .select('key, value')
    .in('key', ['gemini_api_key', 'gemini_chapters_prompt'])

  const map = {}
  ;(data || []).forEach((r) => { map[r.key] = r.value })
  return map
}

export async function generateChapters(title, author) {
  const settings = await getSettings()

  const apiKey = settings.gemini_api_key || import.meta.env.VITE_GEMINI_API_KEY
  if (!apiKey) throw new Error('Gemini API key not set. Add it in Admin → Chapters → Settings.')

  const promptTemplate = settings.gemini_chapters_prompt || ''
  const prompt = promptTemplate.replace('{title}', title).replace('{author}', author)

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

  const chapters = JSON.parse(text)
  if (!Array.isArray(chapters)) throw new Error('Invalid response format')
  return chapters
}
