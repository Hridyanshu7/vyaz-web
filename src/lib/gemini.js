const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY
const MODEL = 'gemini-2.0-flash'

export async function generateChapters(title, author) {
  if (!GEMINI_API_KEY) throw new Error('VITE_GEMINI_API_KEY not set')

  const prompt = `List all chapters of the book "${title}" by ${author}.
Return ONLY a valid JSON array with no markdown, no explanation, no code block:
[{"number":1,"title":"Exact Chapter Title","oneliner":"One sentence describing what this chapter covers."}]`

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
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
