// Ported verbatim from block-lab/src/lib/groupBlocks.js. Turns a flat blocks[] into stream
// "entries" BookStage renders one at a time:
// - runs of role-free heading/paragraph/list collapse into one narration run
// - runs of blocks sharing the same `role` (sidebar/tip/note/…) collapse into one callout
// - a role-free table/image/svg always stands alone
const TEXT_TYPES = new Set(['heading', 'paragraph', 'list'])
const SPECIAL_TYPES = new Set(['table', 'image', 'svg'])

export function groupBlocks(blocks) {
  const entries = []
  let buf = []
  let bufKind = null

  // An entry becomes visible once playback crosses its earliest block's cue — for a
  // grouped run that's whichever block was cued soonest, not just the first one.
  const flush = () => {
    if (buf.length) {
      const cueIndex = Math.min(...buf.map((b) => b.cueIndex ?? 0))
      entries.push({ kind: bufKind, blocks: buf, cueIndex })
    }
    buf = []
    bufKind = null
  }

  for (const b of blocks) {
    if (b.role) {
      if (bufKind === 'callout' && buf[0]?.role === b.role) {
        buf.push(b)
      } else {
        flush()
        buf = [b]
        bufKind = 'callout'
      }
      continue
    }
    if (SPECIAL_TYPES.has(b.type)) {
      flush()
      entries.push({ kind: b.type, blocks: [b], cueIndex: b.cueIndex ?? 0 })
      continue
    }
    if (TEXT_TYPES.has(b.type)) {
      if (bufKind === 'text') buf.push(b)
      else { flush(); buf = [b]; bufKind = 'text' }
      continue
    }
  }
  flush()
  return entries
}
