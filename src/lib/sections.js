// Split chapter content into ~targetWords sections WITHOUT dropping any text.
// Short paragraphs are merged into the current section (never discarded), so the
// concatenation of section texts covers 100% of the chapter's words.
export function splitIntoSections(content, targetWords = 350) {
  const paragraphs = content.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)

  const sections = []
  let current = []
  let wordCount = 0

  for (const para of paragraphs) {
    const words = para.split(/\s+/).length
    if (wordCount + words > targetWords && current.length > 0) {
      sections.push({ number: sections.length + 1, text: current.join('\n\n') })
      current = [para]
      wordCount = words
    } else {
      current.push(para)
      wordCount += words
    }
  }

  if (current.length > 0) {
    sections.push({ number: sections.length + 1, text: current.join('\n\n') })
  }

  return sections
}

// Verify sections cover 100% of the chapter's words. Returns coverage %.
export function sectionCoverage(content, sections) {
  const norm = (t) => (t || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean)
  const contentWords = norm(content).length
  const sectionWords = norm((sections || []).map((s) => s.text).join(' ')).length
  const pct = contentWords ? Math.round((sectionWords / contentWords) * 100) : 100
  return { contentWords, sectionWords, pct }
}
