// The one word-tokenization rule shared by everything that needs to agree on a word's
// numeric position in a chapter: GeminiLiveSession's _chapterWords (wordPtr's own coordinate
// space), anchors.js's cueIndex (block word-offsets), and BookStage.jsx's per-word karaoke
// index. Punctuation-attached constructs (em-dashes with no surrounding spaces, e.g.
// "QUESTION—What") are common in real prose and split into separate words here — a naive
// whitespace-only split (`\S+`) would count "question—what" as ONE token instead of two,
// silently drifting cueIndex and wordPtr apart the longer a chapter runs. Every consumer of
// word-position math MUST route through this function — a second, differently-behaved
// tokenizer anywhere in the pipeline reintroduces exactly this bug.
export function normalizeWords(text) {
  return (text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean)
}
