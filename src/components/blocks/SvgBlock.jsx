// Ported from block-lab's components/blocks/SvgBlock.jsx (SvgContent only). Only reached
// for the rare inline vector chart that isn't just a cover-image wrapper (that shape is
// caught at parse time in epub.js and emitted as a normal `image` block instead).
export function SvgContent({ block }) {
  return (
    <>
      <div className="max-w-full [&_svg]:max-w-full [&_svg]:h-auto" dangerouslySetInnerHTML={{ __html: block.markup }} />
      {block.desc && <p className="text-[11px] text-muted mt-1.5 italic">{block.desc}</p>}
    </>
  )
}
