import { cn } from '@/lib/utils'

interface BadgeProps {
  children: React.ReactNode
  color?: string
  className?: string
  variant?: 'default' | 'pin' | 'colored'
}

export default function Badge({ children, color, className, variant = 'default' }: BadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center px-2 py-0.5 rounded-[6px] text-[10px] font-semibold tracking-wide',
      variant === 'pin' && 'bg-surface2 text-text2 border border-border',
      variant === 'colored' && 'border',
      className
    )}
      style={variant === 'colored' && color ? {
        background: `${color}12`,
        color,
        borderColor: `${color}35`,
      } : undefined}>
      {children}
    </span>
  )
}
