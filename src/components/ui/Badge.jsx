const variants = {
  default: 'bg-surface text-foreground border border-border',
  highlight: 'bg-highlight/10 text-highlight',
  success: 'bg-success/10 text-success',
  muted: 'bg-surface text-muted',
}

export function Badge({ variant = 'default', className = '', children }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${variants[variant]} ${className}`}>
      {children}
    </span>
  )
}
