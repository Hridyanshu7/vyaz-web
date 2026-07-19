import { Image as ImageIcon } from 'lucide-react'

// Ported from block-lab's components/blocks/ImageBlock.jsx (ImageContent only).
export function ImageContent({ block }) {
  return (
    <>
      {block.assetUrl ? (
        <img src={block.assetUrl} alt={block.alt || ''} className="max-w-full rounded-lg border border-border" />
      ) : (
        <div className="flex items-center gap-2 px-3 py-4 rounded-lg border border-dashed border-border text-muted">
          <ImageIcon size={14} />
          <span>Image failed to extract{block.alt ? `: ${block.alt}` : ''}</span>
        </div>
      )}
      {block.caption && <p className="text-[11px] text-muted mt-1.5 italic">{block.caption}</p>}
    </>
  )
}
