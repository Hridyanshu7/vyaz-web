import { useMemo } from 'react'
import { normalizeWords } from '../../lib/words'

// design-language.html §12 — one continuous track spanning the whole book (not per-chapter),
// a fixed 12×12px dot per chapter positioned proportionally by cumulative word count, and a
// fill bar showing overall position. Clicking a dot picks a starting chapter — it does not
// scrub to a mid-chapter position, since Gemini Live narration can't jump mid-stream without
// re-prompting the model (the same reason jump_to_chapter tears down and reconnects rather
// than seeking in place). Unlike block-lab's sandbox version, clicking during a live session
// is allowed here: GeminiLiveModal's connect effect already reconnects on any chapter-index
// change, the exact same path a voice-triggered jump_to_chapter uses.
export function BookSeekBar({ chapters, chapterIdx, setChapterIdx, wordIndex = -1 }) {
  // Chapters don't carry a pre-computed `totalWords` field anywhere in vyaz (computeAnchors
  // returns one, but useLiveSession.js only fetches/anchors the ACTIVE chapter's blocks, so
  // it's never available for the other N-1 chapters a whole-book seek bar needs). `content`
  // is already loaded client-side as part of `book.chapters`, so counting it directly here is
  // free — no extra fetch — using the same shared tokenizer as wordPtr/cueIndex so a chapter's
  // word count here means the same thing it means everywhere else in the pipeline.
  const { marks, totalBookWords } = useMemo(() => {
    let cursor = 0
    const marks = (chapters || []).map((c) => {
      const start = cursor
      const words = normalizeWords(c.content || (c.sections || []).map((s) => s.text).join(' ')).length
      cursor += words
      return { start, totalWords: words }
    })
    return { marks, totalBookWords: cursor || 1 }
  }, [chapters])

  if (!chapters?.length) return null

  const wordsIntoBook = marks[chapterIdx]?.start ?? 0
  const globalWordIndex = wordsIntoBook + Math.max(wordIndex, 0)
  const fillPct = Math.min(100, (globalWordIndex / totalBookWords) * 100)
  const active = chapters[chapterIdx]

  return (
    <div className="px-4 py-3 shrink-0">
      <div className="relative h-1.5 rounded-full bg-border">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-highlight transition-all duration-300"
          style={{ width: `${fillPct}%` }}
        />
        {marks.map((m, i) => (
          <button
            key={i}
            onClick={() => setChapterIdx(i)}
            title={`${chapters[i].number}. ${chapters[i].title}`}
            aria-label={`Start from Chapter ${chapters[i].number}: ${chapters[i].title}`}
            className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 -translate-x-1/2 rounded-full border-2 border-surface cursor-pointer transition-colors ${
              i === chapterIdx ? 'bg-highlight' : 'bg-border-strong hover:bg-highlight/60'
            }`}
            style={{ left: `${(m.start / totalBookWords) * 100}%` }}
          />
        ))}
      </div>
      <div className="flex items-center justify-between mt-2.5 text-[10px] text-muted">
        <span className="truncate pr-2">Ch {active?.number}: {active?.title}</span>
        <span className="shrink-0">{chapters.length} chapters</span>
      </div>
    </div>
  )
}
