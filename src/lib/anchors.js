// Ported from block-lab/src/lib/anchors.js — assigns every content block a `cueIndex` (its
// position in the chapter's narration word stream) so live playback can trigger a visual the
// instant narration reaches the right moment, using the same word-offset space
// GeminiLiveSession's word-alignment progress pointer already tracks. Computed CLIENT-SIDE,
// ON LOAD, not persisted to book_content_blocks — cheap to recompute, and this whole feature
// is still actively iterating (no migration needed to change how cueIndex is derived later).

import { normalizeWords } from './words'

function spansToText(spans) {
  return spans.map((s) => s.text).join('')
}

// MUST match GeminiLiveSession's own tokenization exactly (see words.js) — cueIndex and
// wordPtr are compared directly against each other, so any difference in how a word is
// counted (e.g. a naive \S+ split leaving punctuation-attached constructs like "QUESTION—What"
// as one token instead of two) silently drifts the two out of alignment over a chapter.
function wordCount(s) {
  return normalizeWords(s).length
}

const TEXT_TYPES = new Set(['heading', 'paragraph', 'list'])
const VISUAL_TYPES = new Set(['image', 'table', 'svg'])

function blockOwnWordCount(b) {
  if (b.type === 'heading') return wordCount(b.text)
  if (b.type === 'paragraph') return wordCount(spansToText(b.spans))
  if (b.type === 'list') return b.items.reduce((sum, spans) => sum + wordCount(spansToText(spans)), 0)
  return 0
}

// A visual's own caption/alt/title often carries its figure number ("Figure 3.2: Revenue
// trend") — this is the id side of the cross-reference match below.
function captionNumber(block) {
  const text = block.caption || block.alt || block.title || ''
  const m = /\b(?:fig(?:ure)?|table|chart)\.?\s*(\d+(?:\.\d+)?)\b/i.exec(text)
  return m ? m[1] : null
}

// Textbooks/technical books routinely discuss a figure well away from where it physically
// sits (a plates section, a "see Table 4 below" pointing at content set earlier) — plain
// structural position gets this wrong. Scan the flattened narration text for these mentions
// and record the word-offset each one occurs at, keyed by figure number.
const REF_RE = /\b(?:fig(?:ure)?|table|chart)\.?\s*(\d+(?:\.\d+)?)\b/gi

function findReferenceOffsets(narrationText) {
  const offsets = new Map() // number -> earliest word-offset it's mentioned at
  let match
  REF_RE.lastIndex = 0
  while ((match = REF_RE.exec(narrationText))) {
    const num = match[1]
    if (offsets.has(num)) continue
    const before = narrationText.slice(0, match.index)
    offsets.set(num, wordCount(before))
  }
  return offsets
}

// Reveal a reference-matched visual a little ahead of the sentence that names it — closer to
// how a museum guide gestures at a piece before describing it, rather than announcing it
// mid-description.
const REFERENCE_LEAD_WORDS = 8

// Below this many narratable words per visual, verbatim-narration-with-synced-visual is
// probably the wrong mode entirely (picture books, atlases, comics) — flagged, not solved.
const VISUAL_DENSITY_THRESHOLD_WORDS = 60

// `narrationText` is the chapter's own flattened verbatim text (vyaz's `chapter.content` —
// the same source GeminiLiveSession's word-alignment pointer narrates from) — passed in
// separately from `blocks` since in vyaz the two are fetched from different tables
// (books.chapters vs book_content_blocks) rather than derived from the same parse in memory.
export function computeAnchors(blocks, narrationText) {
  const refOffsets = findReferenceOffsets(narrationText || '')

  let cursor = 0
  let visualCount = 0
  for (const block of blocks) {
    if (TEXT_TYPES.has(block.type)) {
      block.cueIndex = cursor
      block.anchorSource = 'structural'
      cursor += blockOwnWordCount(block)
      continue
    }
    if (VISUAL_TYPES.has(block.type)) {
      visualCount++
      const num = captionNumber(block)
      const refOffset = num != null ? refOffsets.get(num) : undefined
      if (refOffset !== undefined) {
        block.cueIndex = Math.max(0, refOffset - REFERENCE_LEAD_WORDS)
        block.anchorSource = `reference (Fig/Table ${num})`
      } else {
        block.cueIndex = cursor
        block.anchorSource = 'structural'
      }
      continue
    }
    block.cueIndex = cursor
    block.anchorSource = 'structural'
  }

  const totalWords = cursor
  const wordsPerVisual = visualCount > 0 ? Math.round(totalWords / visualCount) : null
  const visualDensity = wordsPerVisual != null && wordsPerVisual < VISUAL_DENSITY_THRESHOLD_WORDS ? 'high' : 'normal'

  return { blocks, totalWords, wordsPerVisual, visualDensity }
}
