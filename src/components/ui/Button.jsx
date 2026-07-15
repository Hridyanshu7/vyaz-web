const variants = {
  primary: 'bg-highlight text-white hover:bg-highlight-hover',
  secondary: 'bg-foreground text-white hover:bg-foreground/90',
  outline: 'border border-border-strong text-foreground hover:bg-surface hover:border-highlight',
  ghost: 'text-foreground hover:bg-surface',
}

const sizes = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
}

export function Button({ variant = 'primary', size = 'md', className = '', children, ...props }) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-lg font-medium transition-colors
        disabled:opacity-50 disabled:pointer-events-none cursor-pointer
        ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
