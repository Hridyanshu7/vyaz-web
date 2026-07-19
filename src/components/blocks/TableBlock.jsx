// Ported from block-lab's components/blocks/TableBlock.jsx (TableContent only — the
// SpecialBlockShell debug wrapper is a block-lab-only testing affordance, not needed here).
export function TableContent({ block }) {
  const [header, ...rows] = block.rows
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-[11px] border-collapse">
        <thead>
          <tr>
            {header.map((cell, i) => (
              <th key={i} className="text-left font-semibold px-2 py-1 border-b border-border whitespace-nowrap">{cell}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="odd:bg-surface/60">
              {row.map((cell, j) => (
                <td key={j} className="px-2 py-1 border-b border-border/60 align-top">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
