import { Lightbulb, Info, AlertTriangle, PanelRight, Asterisk, MessageSquare, ClipboardList, Quote, HelpCircle } from 'lucide-react'
import { renderSpans } from './spans'
import { TableContent } from './TableBlock'
import { ImageContent } from './ImageBlock'
import { SvgContent } from './SvgBlock'

const ROLE_META = {
  tip: { icon: Lightbulb, color: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/30' },
  note: { icon: Info, color: 'text-highlight', bg: 'bg-accent-wash', border: 'border-highlight/30' },
  notice: { icon: Info, color: 'text-highlight', bg: 'bg-accent-wash', border: 'border-highlight/30' },
  warning: { icon: AlertTriangle, color: 'text-error', bg: 'bg-error/10', border: 'border-error/30' },
  sidebar: { icon: PanelRight, color: 'text-muted', bg: 'bg-surface', border: 'border-border' },
  footnote: { icon: Asterisk, color: 'text-muted', bg: 'bg-surface', border: 'border-border' },
  endnote: { icon: Asterisk, color: 'text-muted', bg: 'bg-surface', border: 'border-border' },
  annotation: { icon: MessageSquare, color: 'text-muted', bg: 'bg-surface', border: 'border-border' },
  'case-study': { icon: ClipboardList, color: 'text-success', bg: 'bg-success/10', border: 'border-success/30' },
  example: { icon: ClipboardList, color: 'text-success', bg: 'bg-success/10', border: 'border-success/30' },
  practice: { icon: ClipboardList, color: 'text-success', bg: 'bg-success/10', border: 'border-success/30' },
  pullquote: { icon: Quote, color: 'text-foreground', bg: 'bg-surface', border: 'border-border' },
  help: { icon: HelpCircle, color: 'text-muted', bg: 'bg-surface', border: 'border-border' },
}

function BlockInner({ block }) {
  if (block.type === 'heading') return <p className="font-semibold">{block.text}</p>
  if (block.type === 'paragraph') return <p>{renderSpans(block.spans)}</p>
  if (block.type === 'list') {
    const Tag = block.ordered ? 'ol' : 'ul'
    return (
      <Tag className={`pl-4 space-y-0.5 ${block.ordered ? 'list-decimal' : 'list-disc'}`}>
        {block.items.map((spans, i) => <li key={i}>{renderSpans(spans)}</li>)}
      </Tag>
    )
  }
  if (block.type === 'table') return <TableContent block={block} />
  if (block.type === 'image') return <ImageContent block={block} />
  if (block.type === 'svg') return <SvgContent block={block} />
  return null
}

// A run of blocks sharing an EPUB-tagged role (sidebar/tip/note/warning/…, see Vyaz
// DECISIONS B7) — book content, not a narrator remark, so it's a plain card inline in the
// reading surface rather than a chat bubble (unlike block-lab's version, which reused
// chat-bubble framing since its BookStage sat in a more informal preview context).
export function Callout({ blocks }) {
  const role = blocks[0]?.role || 'sidebar'
  const meta = ROLE_META[role] || ROLE_META.sidebar
  const Icon = meta.icon

  return (
    <div className={`rounded-2xl border ${meta.border} ${meta.bg} px-3 py-2.5 text-xs leading-relaxed`}>
      <div className={`flex items-center gap-1.5 mb-1.5 ${meta.color}`}>
        <Icon size={12} className="shrink-0" />
        <span className="text-[10px] font-medium uppercase tracking-wide">{role.replace('-', ' ')}</span>
      </div>
      <div className="space-y-2 text-foreground">
        {blocks.map((b, i) => <BlockInner key={i} block={b} />)}
      </div>
    </div>
  )
}
