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
        'group relative flex w-full select-none items-center justify-center gap-2 overflow-hidden rounded-[14px] border font-body text-[14px] font-black transition-all active:scale-[.99] disabled:cursor-not-allowed disabled:opacity-50',
        'focus-visible:ring-2 focus-visible:ring-coral/50 focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        'h-[54px]',
        variant === 'primary' && 'border-[#075CFF] bg-[#075CFF] text-white shadow-[0_16px_34px_rgba(7,92,255,0.24)] hover:border-[#0A67FF] hover:bg-[#0A67FF]',
        variant === 'ghost'   && 'border-[#D8E2F2] bg-white text-[#44506E] shadow-[0_12px_28px_rgba(30,56,104,0.05)] hover:border-[#B8CCFF] hover:text-[#075CFF]',
        variant === 'danger'  && 'bg-red-50 border border-red-200 text-red-700 hover:bg-red-100',
        className
      )}
      {...props}
    >
      {loading ? <Loader2 size={20} className="animate-spin" /> : children}
    </button>
  )
}
