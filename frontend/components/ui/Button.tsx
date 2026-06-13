import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'danger'
  loading?: boolean
  children: React.ReactNode
}

export default function Button({ variant = 'primary', loading, children, className, disabled, ...props }: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={cn(
        'group relative flex items-center justify-center gap-2 w-full h-[52px] overflow-hidden rounded-[8px] font-body text-[14px] font-bold transition-all active:scale-[.99] disabled:opacity-50 disabled:cursor-not-allowed select-none',
        'focus-visible:ring-2 focus-visible:ring-coral/50 focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        variant === 'primary' && 'bg-text1 text-bg border border-text1 shadow-[0_8px_20px_rgba(21,25,20,0.12)] hover:bg-coral hover:border-coral hover:text-white',
        variant === 'ghost'   && 'bg-surface border border-border text-text2 hover:border-text1 hover:text-text1',
        variant === 'danger'  && 'bg-red-50 border border-red-200 text-red-700 hover:bg-red-100',
        className
      )}
      {...props}
    >
      {loading ? <Loader2 size={20} className="animate-spin" /> : children}
    </button>
  )
}
