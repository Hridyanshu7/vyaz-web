import { useEffect, useMemo, useRef } from 'react'
import { groupBlocks } from '../../lib/groupBlocks'
import { normalizeWords } from '../../lib/words'
import { renderSpans } from '../blocks/spans'
import { Callout } from '../blocks/Callout'
import { TableContent } from '../blocks/TableBlock'
import { ImageContent } from '../blocks/ImageBlock'
import { SvgContent } from '../blocks/SvgBlock'

const TEXT_TYPES = new Set(['heading', 'paragraph', 'list'])
const HEADING_SIZES = { 1: 'text-lg font-semibold', 2: 'text-base font-semibold', 3: 'text-sm font-semibold', 4: 'text-sm font-medium' }

// design-language.html §5/§12: three-tier reading state, not block-lab's binary
// covered/remaining — read passages dim slightly (.55), the active passage is full-opacity
// with an accent rail, and not-yet-reached text dims further (.35).
const TIER_OPACITY = { read: 'opacity-[.55]', active: 'opacity-100', unread: 'opacity-[.35]' }
const ACTIVE_RAIL = 'border-l-2 border-highlight bg-accent-wash rounded-r-lg -ml-[13px] pl-[11px]'

function PlainBlock({ block }) {
  if (block.type === 'heading') return <p className={HEADING_SIZES[block.level] || 'text-sm font-medium'}>{block.text}</p>
  if (block.type === 'paragraph') return <p className="text-sm leading-relaxed">{renderSpans(block.spans)}</p>
  if (block.type === 'list') {
    const Tag = block.ordered ? 'ol' : 'ul'
    return (
      <Tag className={`pl-5 space-y-1 text-sm leading-relaxed ${block.ordered ? 'list-decimal' : 'list-disc'}`}>
        {block.items.map((spans, j) => <li key={j}>{renderSpans(spans)}</li>)}
      </Tag>
    )
  }
  return null
}

// Every block carries its own `cueIndex` (word offset it starts at, from computeAnchors) —
// a word's global offset is just `block.cueIndex + itsLocalPosition`. Displayed tokens are
// split on raw whitespace (so punctuation like "question—what" stays visually intact as one
// chunk), but each token's `span` — how many wordPtr index-slots it consumes — is counted via
// normalizeWords, the SAME rule GeminiLiveSession's wordPtr itself uses. A raw whitespace
// count here would under-count exactly these attached-punctuation chunks and drift the
// karaoke highlight out of sync with the real pointer as the chapter goes on.
function tokenizeWords(text, marks, startIndex) {
  let idx = startIndex
  return text.split(/\s+/).filter(Boolean).map((w) => {
    const span = normalizeWords(w).length || 1
    const token = { text: w, marks, index: idx, span }
    idx += span
    return token
  })
}

function tokenizeParagraph(block) {
  const tokens = []
  let i = 0
  for (const span of block.spans) {
    const words = tokenizeWords(span.text, span.marks, block.cueIndex + i)
    tokens.push(...words)
    i += words.reduce((sum, w) => sum + w.span, 0)
  }
  return tokens
}

function tokenizeListItems(block) {
  let i = 0
  return block.items.map((spans) => {
    const item = []
    for (const span of spans) {
      const words = tokenizeWords(span.text, span.marks, block.cueIndex + i)
      item.push(...words)
      i += words.reduce((sum, w) => sum + w.span, 0)
    }
    return item
  })
}

// `.w-unread` (design-language.html §12) — within the active passage, words not yet
// reached dim at word granularity; everything up to wordPtr is full-opacity.
function WordSpan({ token, wordPtr }) {
  const covered = wordPtr === -1 || token.index <= wordPtr
  let node = token.text
  if (token.marks?.includes('bold')) node = <strong>{node}</strong>
  if (token.marks?.includes('italic')) node = <em>{node}</em>
  if (token.marks?.includes('underline')) node = <u>{node}</u>
  return <span className={covered ? '' : 'opacity-[.35] transition-opacity duration-150'}>{node} </span>
}

// Word-by-word reveal, rendered for exactly the one active block (never a whole
// multi-paragraph run) — a plain-prose chapter with no images/asides routinely collapses
// into one giant groupBlocks entry, so activity is tracked per BLOCK, not per entry.
function ActiveBlock({ block, wordPtr }) {
  if (block.type === 'heading') {
    const tokens = tokenizeWords(block.text, [], block.cueIndex)
    return <p className={HEADING_SIZES[block.level] || 'text-sm font-medium'}>{tokens.map((t, i) => <WordSpan key={i} token={t} wordPtr={wordPtr} />)}</p>
  }
  if (block.type === 'paragraph') {
    const tokens = tokenizeParagraph(block)
    return <p className="text-sm leading-relaxed">{tokens.map((t, i) => <WordSpan key={i} token={t} wordPtr={wordPtr} />)}</p>
  }
  if (block.type === 'list') {
    const Tag = block.ordered ? 'ol' : 'ul'
    return (
      <Tag className={`pl-5 space-y-1 text-sm leading-relaxed ${block.ordered ? 'list-decimal' : 'list-disc'}`}>
        {tokenizeListItems(block).map((tokens, j) => (
          <li key={j}>{tokens.map((t, i) => <WordSpan key={i} token={t} wordPtr={wordPtr} />)}</li>
        ))}
      </Tag>
    )
  }
  return null
}

function tierFor(cueIndex, endIndex, wordPtr, isActive) {
  if (isActive) return 'active'
  if (wordPtr === -1) return 'unread'
  if (endIndex <= wordPtr) return 'read'
  if (cueIndex > wordPtr) return 'unread'
  return 'active' // straddles the pointer but wasn't picked as THE active block — treat as active tier
}

function TextEntry({ blocks, wordPtr, activeBlock, activeRef }) {
  return (
    <div className="space-y-2">
      {blocks.map((b, i) => {
        const isActive = b === activeBlock
        const tier = tierFor(b.cueIndex, b.cueIndex + 1, wordPtr, isActive)
        return (
          <div
            key={i}
            ref={isActive ? activeRef : null}
            className={['transition-all duration-300', TIER_OPACITY[tier], isActive ? ACTIVE_RAIL : ''].filter(Boolean).join(' ')}
          >
            {isActive ? <ActiveBlock block={b} wordPtr={wordPtr} /> : <PlainBlock block={b} />}
          </div>
        )
      })}
    </div>
  )
}

function VisualEntry({ entry }) {
  const block = entry.blocks[0]
  const Content = { table: TableContent, image: ImageContent, svg: SvgContent }[entry.kind]
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2.5 text-xs">
      {Content ? <Content block={block} /> : null}
    </div>
  )
}

// The RHS reading surface — the actual book content, in full, as one continuous scrollable
// document (never filtered/hidden). Reading progress is communicated with the design doc's
// three-tier opacity + an accent rail on the active passage, not by hiding anything.
export function BookStage({ chapter, blocks, wordIndex = -1 }) {
  const entries = useMemo(() => groupBlocks(blocks || []), [blocks])

  const activeBlock = useMemo(() => {
    if (wordIndex === -1) return null
    let active = null
    for (const b of blocks || []) {
      if (TEXT_TYPES.has(b.type) && b.cueIndex <= wordIndex) active = b
    }
    return active
  }, [blocks, wordIndex])

  const activeEntryIndex = useMemo(() => {
    if (wordIndex === -1) return -1
    let idx = -1
    entries.forEach((e, i) => { if (e.kind !== 'text' && e.cueIndex <= wordIndex) idx = i })
    return idx
  }, [entries, wordIndex])

  const activeRef = useRef(null)
  useEffect(() => {
    if (!activeBlock && activeEntryIndex === -1) return
    activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [activeBlock, activeEntryIndex])

  if (!blocks?.length) {
    return (
      <div className="flex-1 flex items-center justify-center px-6 py-10 min-h-[240px]">
        <p className="text-xs text-muted text-center leading-relaxed">
          {chapter ? 'This chapter has no structured content to display yet.' : 'Loading the chapter…'}
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0">
      <div className="space-y-4 max-w-2xl">
        {entries.map((entry, i) => {
          if (entry.kind === 'text') return <TextEntry key={i} blocks={entry.blocks} wordPtr={wordIndex} activeBlock={activeBlock} activeRef={activeRef} />

          const isActive = i === activeEntryIndex
          const tier = tierFor(entry.cueIndex, entry.cueIndex + 1, wordIndex, isActive)
          const node = entry.kind === 'callout' ? <Callout blocks={entry.blocks} /> : <VisualEntry entry={entry} />
          return (
            <div
              key={i}
              ref={isActive ? activeRef : null}
              className={['transition-all duration-300', TIER_OPACITY[tier], isActive ? `${ACTIVE_RAIL} py-1` : ''].filter(Boolean).join(' ')}
            >
              {node}
            </div>
          )
        })}
      </div>
    </div>
  )
}
