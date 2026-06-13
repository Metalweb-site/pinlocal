import { cn } from '@/lib/utils'
import { forwardRef } from 'react'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

const Input = forwardRef<HTMLInputElement, InputProps>(({ label, error, className, ...props }, ref) => (
  <div className="w-full">
    {label && <div className="text-[11px] font-bold text-text2 mb-2 ml-0.5">{label}</div>}
    <input
      ref={ref}
      className={cn(
        'w-full h-[50px] bg-surface border border-border rounded-[8px] px-4 text-text1 font-body text-[15px] outline-none transition-all',
        'focus:border-text1 focus:shadow-[0_0_0_3px_rgba(21,25,20,.08)]',
        'placeholder:text-text3',
        error && 'border-red-500/60',
        className
      )}
      {...props}
    />
    {error && <p className="text-red-400 text-[11px] mt-1 font-mono">{error}</p>}
  </div>
))
Input.displayName = 'Input'
export default Input
