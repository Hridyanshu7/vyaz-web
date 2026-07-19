// Render a block's inline `spans` (bold/italic/underline marks), matching the mark set
// epub.js's parser produces. Ported from block-lab's components/blocks/spans.jsx.
export function renderSpans(spans) {
  return spans.map((s, i) => {
    let node = s.text
    if (s.marks.includes('bold')) node = <strong key={i}>{node}</strong>
    if (s.marks.includes('italic')) node = <em key={i}>{node}</em>
    if (s.marks.includes('underline')) node = <u key={i}>{node}</u>
    return <span key={i}>{node}</span>
  })
}
