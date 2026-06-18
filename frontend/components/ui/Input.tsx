import { cn } from '@/lib/utils'
import { forwardRef } from 'react'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

const Input = forwardRef<HTMLInputElement, InputProps>(({ label, error, className, ...props }, ref) => (
  <div className="w-full">
    {label && <div className="mb-2 ml-0.5 text-[12px] font-black uppercase tracking-[0.08em] text-[#44506E]">{label}</div>}
    <input
      ref={ref}
      className={cn(
        'form-input font-body',
        error && 'border-red-500/60 focus:border-red-500 focus:shadow-[0_0_0_4px_rgba(239,68,68,0.10),0_18px_36px_rgba(239,68,68,0.10)]',
        className
      )}
      {...props}
    />
    {error && <p className="mt-2 text-[11px] font-bold text-red-500">{error}</p>}
  </div>
))
Input.displayName = 'Input'
export default Input
