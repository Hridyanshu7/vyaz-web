export function splitIntoSections(content, targetWords = 350) {
  const paragraphs = content.split(/\n{2,}/).map((p) => p.trim()).filter((p) => p.length > 40)

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
