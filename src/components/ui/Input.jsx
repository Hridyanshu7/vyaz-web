export function Input({ label, className = '', ...props }) {
  return (
    <div className="w-full">
      {label && <label className="block text-sm font-medium mb-1.5">{label}</label>}
      <input
        className={`w-full rounded-lg border border-border bg-background px-3 py-2 text-sm
          placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-highlight/20 focus:border-highlight
          ${className}`}
        {...props}
      />
    </div>
  )
}
