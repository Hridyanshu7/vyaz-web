import { useEffect, useRef, useState } from 'react'
import { ThumbsUp, ThumbsDown, Send } from 'lucide-react'

// Group a run of narration into readable paragraphs (~2 sentences each). The trailing,
// not-yet-terminated portion of a streaming/mid-sentence segment must be preserved
// explicitly, or those spoken words never render even though they're in the buffer + audio.
function toParagraphs(text) {
  const sentences = text.match(/[^.!?]+[.!?]+(\s|$)/g) || []
  const tail = text.slice(sentences.join('').length)
  const units = tail.trim() ? [...sentences, tail] : sentences
  if (units.length === 0) return [text.trim()].filter(Boolean)
  const paras = []
  for (let i = 0; i < units.length; i += 2) paras.push(units.slice(i, i + 2).join(' ').trim())
  return paras.filter(Boolean)
}

// Real agent turn from a live session. Narration segments are dropped entirely here — the
// RHS BookStage is the real reading surface (word-level highlight), so this panel only ever
// shows the agent's own asides, never book text.
function AgentTurn({ segments, text }) {
  const asides = segments ? segments.filter((s) => s.type === 'aside') : []
  if (segments && asides.length === 0) return null
  if (!segments) return <p className="italic text-muted border-l-2 border-border pl-2">{text}</p>
  return (
    <div className="space-y-2">
      {asides.map((seg, i) => (
        <div key={i} className="italic text-muted border-l-2 border-border pl-2 space-y-1">
          {toParagraphs(seg.text).map((p, j) => <p key={j}>{p}</p>)}
        </div>
      ))}
    </div>
  )
}

function UserTurn({ text }) {
  return (
    <div className="flex flex-col items-end gap-1">
      <span className="text-[10px] text-muted px-1">You</span>
      <div className="max-w-[85%] px-3 py-2 rounded-2xl rounded-tr-none text-xs leading-relaxed bg-highlight text-white">
        {text}
      </div>
    </div>
  )
}

// Thumbs up/down on an agent aside. Thumbs-down opens a remarks field that only commits on
// explicit Submit — never on every keystroke — then collapses to a click-to-edit line.
function MessageFeedback({ sessionId, msg, setVoiceMessageFeedback }) {
  const thumbs = msg.feedback?.thumbs || null
  const savedRemarks = msg.feedback?.remarks || ''
  const [draft, setDraft] = useState(savedRemarks)
  const [editing, setEditing] = useState(false)

  const toggle = (value) => {
    if (thumbs === value) {
      setVoiceMessageFeedback(sessionId, msg.id, null)
      setDraft('')
      setEditing(false)
      return
    }
    if (value === 'up') {
      setVoiceMessageFeedback(sessionId, msg.id, { thumbs: 'up', remarks: '' })
      setDraft('')
      setEditing(false)
      return
    }
    setVoiceMessageFeedback(sessionId, msg.id, { thumbs: 'down', remarks: '' })
    setDraft('')
    setEditing(true)
  }

  const submit = () => {
    setVoiceMessageFeedback(sessionId, msg.id, { thumbs: 'down', remarks: draft.trim() })
    setEditing(false)
  }

  return (
    <div className="flex items-center gap-1.5 px-1">
      <button onClick={() => toggle('up')} aria-label="Good response"
        className={`p-1 rounded-md cursor-pointer transition-colors ${thumbs === 'up' ? 'text-success bg-success/10' : 'text-muted hover:text-foreground'}`}>
        <ThumbsUp size={12} />
      </button>
      <button onClick={() => toggle('down')} aria-label="Bad response"
        className={`p-1 rounded-md cursor-pointer transition-colors ${thumbs === 'down' ? 'text-error bg-error/10' : 'text-muted hover:text-foreground'}`}>
        <ThumbsDown size={12} />
      </button>
      {thumbs === 'down' && (
        editing ? (
          <>
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
              placeholder="What went wrong? (optional)"
              autoFocus
              className="flex-1 text-[11px] px-2 py-1 rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-highlight"
            />
            <button onClick={submit} aria-label="Submit remarks" className="p-1 rounded-md text-highlight hover:bg-highlight/10 cursor-pointer shrink-0">
              <Send size={12} />
            </button>
          </>
        ) : (
          <button onClick={() => { setDraft(savedRemarks); setEditing(true) }}
            className="flex-1 text-left text-[11px] px-2 py-1 rounded-md border border-transparent hover:border-border text-muted truncate cursor-pointer">
            {savedRemarks || 'Add a reason…'}
          </button>
        )
      )}
    </div>
  )
}

// LHS of the Session Modal (design-language.html §12) — conversation only, never book
// content: the RHS BookStage is the real reading surface. Only ever shows the agent's own
// asides/remarks and the user's spoken turns; a pure verbatim-reading turn renders nothing.
export function ConversationPanel({ conversation, sessionId, setVoiceMessageFeedback, connected }) {
  const scrollRef = useRef(null)
  const stickToBottomRef = useRef(true)
  const visible = (conversation || []).filter((msg) => msg.role === 'user' || (msg.segments || []).some((s) => s.type === 'aside') || !msg.segments)

  useEffect(() => {
    if (stickToBottomRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [visible.length])

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }

  if (visible.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center px-6 py-10 min-h-[140px]">
        <p className="text-xs text-muted text-center leading-relaxed">
          {connected
            ? "The narrator is reading — that's on the right. It'll interject here if it has something to say, and you can speak anytime to ask a question."
            : 'Starting the session…'}
        </p>
      </div>
    )
  }

  return (
    <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
      {visible.map((msg) => (
        <div key={msg.id} className="space-y-1">
          {msg.role === 'agent' ? <AgentTurn segments={msg.segments} text={msg.text} /> : <UserTurn text={msg.text} />}
          {msg.role === 'agent' && sessionId && (
            <MessageFeedback sessionId={sessionId} msg={msg} setVoiceMessageFeedback={setVoiceMessageFeedback} />
          )}
        </div>
      ))}
    </div>
  )
}
