import { useCallback, useEffect, useRef, useState } from 'react'
import { getGeminiLiveSession, GeminiLiveSession } from './geminiLive'
import { fetchChapterBlocks } from './bookContent'
import { computeAnchors } from './anchors'
import { generateChapterOneliners, formatChapterList } from './chapterOneliners'

const VISUAL_TYPES = new Set(['image', 'table', 'svg'])

function activeVisualAt(blocks, wordIndex) {
  if (wordIndex === -1) return null
  let active = null
  for (const b of blocks) {
    if (!VISUAL_TYPES.has(b.type)) continue
    if (b.cueIndex <= wordIndex) { if (!active || b.cueIndex >= active.cueIndex) active = b }
  }
  return active
}

function bestVisualMatch(blocks, needle) {
  const words = needle.toLowerCase().split(/\s+/).filter(Boolean)
  let best = null, bestScore = 0
  for (const b of blocks) {
    if (!VISUAL_TYPES.has(b.type)) continue
    const text = (b.caption || b.alt || b.title || '').toLowerCase()
    if (!text) continue
    const score = words.filter((w) => text.includes(w)).length
    if (score > bestScore) { bestScore = score; best = b }
  }
  return best
}

// Session-lifecycle + chapter-switching + karaoke-data hook for production Talk, mirroring
// block-lab's useLiveSession.js architecture — but unlike that sandbox version, this one does
// NOT own DB persistence itself. GeminiLiveModal.jsx still does all of that (startVoiceSessionRecord,
// upsertVoiceMessage, voice_events inserts, endVoiceSessionRecord) — this hook just accepts
// pass-through callbacks (onStateChange/onTranscript/onProgress/onError/onEvent) and forwards
// them to the underlying GeminiLiveSession, so nothing about the persistence contract changes.
//
// New here vs. what GeminiLiveModal.jsx did inline before: fetches book_content_blocks for the
// active chapter and runs computeAnchors on it (cueIndex for karaoke highlighting — this data
// pipeline didn't exist in production at all before), and resolves jump_to_chapter/describe_visual
// tool calls (block-lab's Slice 2a/2b, ported).
export function useLiveSession({ book, chapters, chapterIdx, setChapterIdx, mode = 'chapter', listenerName,
  onStateChange, onTranscript, onProgress, onError, onEvent }) {
  const [wordPtr, setWordPtr] = useState(-1)
  const [blocks, setBlocks] = useState([])
  const [blocksLoading, setBlocksLoading] = useState(false)
  const sessionRef = useRef(null)
  const chapter = chapters?.[chapterIdx] ?? null
  const onelinersRef = useRef({ chapters: null, data: {} })
  // Set right before a successful jump_to_chapter changes chapterIdx. GeminiLiveSession.end()
  // (called internally to tear down the old chapter's session before the new one connects)
  // sets state to 'ended' same as a real end_session/manual close — the caller checks this
  // flag to tell "the model hung up" apart from "we're reconnecting on a new chapter" and
  // consumes it (sets back to false) the moment it's read, so a LATER genuine end isn't
  // also mistaken for a chapter switch.
  const chapterSwitchRef = useRef(false)
  const sentVisualsRef = useRef(new Set())

  // Fetch + anchor this chapter's rich blocks whenever the chapter changes. Best-effort: a
  // book processed before migration 010 (or one whose book_content_blocks row is empty) just
  // yields no blocks — Talk still works exactly as it does today (flat content, no karaoke
  // highlight, no describe_visual matches), not an error state.
  useEffect(() => {
    if (!book?.id || chapter?.number == null || mode === 'gist') { setBlocks([]); return }
    let cancelled = false
    setBlocksLoading(true)
    fetchChapterBlocks(book.id, chapter.number)
      .then((raw) => {
        if (cancelled) return
        const { blocks: anchored } = computeAnchors(raw || [], chapter.content || '')
        setBlocks(anchored)
      })
      .catch((err) => { if (!cancelled) console.warn('[useLiveSession] fetchChapterBlocks failed:', err.message) })
      .finally(() => { if (!cancelled) setBlocksLoading(false) })
    return () => { cancelled = true }
  }, [book?.id, chapter?.number, chapter?.content, mode])

  // Resolves jump_to_chapter / describe_visual — synchronous, called directly from
  // GeminiLiveSession's tool-call handling. describe_visual reads sessionRef.current's live
  // getDisplayWordPtr() (not the wordPtr state var) to avoid closing over a stale value.
  const handleToolCall = useCallback((name, args) => {
    if (name === 'jump_to_chapter') {
      if (!chapters || !setChapterIdx) return { ok: false, error: 'chapter switching not available' }
      let idx = -1
      if (args.chapter_number != null) idx = chapters.findIndex((c) => c.number === args.chapter_number)
      if (idx === -1 && args.chapter_title) {
        const needle = args.chapter_title.toLowerCase()
        idx = chapters.findIndex((c) => (c.title || '').toLowerCase().includes(needle))
      }
      if (idx === -1) return { ok: false, error: 'chapter not found' }
      // No auto-start flag needed here: GeminiLiveModal.jsx's own connect effect already
      // depends on `chapter` and reconnects on ANY chapter change (manual switch or this) —
      // unlike block-lab's sandbox hook, which owns the session lifecycle itself and has to
      // distinguish the two cases explicitly. chapterSwitchRef IS still needed though — see
      // its own comment above.
      chapterSwitchRef.current = true
      setChapterIdx(idx)
      return { ok: true }
    }
    if (name === 'describe_visual') {
      const ref = (args.reference || 'most_recent').trim()
      const block = ref === 'most_recent' || !ref
        ? activeVisualAt(blocks, sessionRef.current?.getDisplayWordPtr() ?? -1)
        : bestVisualMatch(blocks, ref)
      if (!block) return { ok: false, error: 'no matching visual found in this chapter' }
      if (block.type === 'table') return { ok: true, type: 'table', text: block.rows.map((r) => r.join(' | ')).join('\n') }
      if (!block.assetUrl) return { ok: false, error: 'this visual has no describable image' }
      return { ok: true, type: 'image', assetUrl: block.assetUrl }
    }
    return { ok: false, error: 'unknown tool' }
  }, [chapters, setChapterIdx, blocks])

  const start = useCallback(async () => {
    if (!book || (mode !== 'gist' && !chapter) || sessionRef.current) return null
    sentVisualsRef.current = new Set()
    const config = await getGeminiLiveSession(book, chapter, { mode, listenerName })
    // Chapter-list one-liners for jump_to_chapter-by-topic — fire-and-forget on the first
    // session of a book, same lazy/cached approach as block-lab's Slice 2b.
    if (mode !== 'gist' && chapters && onelinersRef.current.chapters !== chapters) {
      onelinersRef.current = { chapters, data: {} }
      generateChapterOneliners(chapters, config.geminiApiKey)
        .then((data) => { if (onelinersRef.current.chapters === chapters) onelinersRef.current.data = data })
        .catch((err) => console.warn('[useLiveSession] chapter one-liners failed:', err.message))
    }
    const chapterList = mode !== 'gist' && chapters ? formatChapterList(chapters, onelinersRef.current.data) : ''
    const liveSystemPrompt = chapterList
      ? (config.liveSystemPrompt || '').replace(/{chapter_list}/g, chapterList)
      : config.liveSystemPrompt
    const session = new GeminiLiveSession({
      ...config,
      liveSystemPrompt,
      mode,
      onStateChange,
      onTranscript,
      onProgress,
      onError,
      onEvent,
      onToolCall: handleToolCall,
    })
    sessionRef.current = session
    await session.start()
    return config
  }, [book, chapter, chapters, mode, listenerName, onStateChange, onTranscript, onProgress, onError, onEvent, handleToolCall])

  const end = useCallback(() => {
    sessionRef.current?.end()
    sessionRef.current = null
  }, [])

  // Poll the audio-clock-interpolated word pointer every frame — drives both the karaoke
  // highlight (once Stage B's book-stage component consumes `wordPtr`) and proactive visual
  // description: the moment the pointer reaches a not-yet-sent visual's cueIndex, send it
  // automatically. Whether/how much the model says about it is entirely prompt-governed.
  useEffect(() => {
    let raf
    const loop = () => {
      const s = sessionRef.current
      if (s?.getDisplayWordPtr) {
        const wp = s.getDisplayWordPtr()
        setWordPtr(wp)
        if (wp !== -1) {
          for (const b of blocks) {
            if (!VISUAL_TYPES.has(b.type) || b.cueIndex > wp || sentVisualsRef.current.has(b)) continue
            sentVisualsRef.current.add(b)
            if (b.type === 'table') s.sendTextContext(`[The narration just reached a table in the chapter. Its data:]\n${b.rows.map((r) => r.join(' | ')).join('\n')}`)
            else if (b.assetUrl) s.sendImageFrame(b.assetUrl)
          }
        }
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [blocks])

  return { wordPtr, blocks, blocksLoading, sessionRef, start, end, chapterSwitchRef }
}
