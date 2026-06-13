import { cn, getInitial } from '@/lib/utils'

interface AvatarProps {
  name?: string | null
  src?: string | null
  size?: number
  color?: string
  className?: string
}

const COLORS = ['#E93F2E','#2A7F62','#B98914','#2F64B1','#6E5AA8','#B04F72']
const colorFor = (name: string) => COLORS[name.charCodeAt(0) % COLORS.length]

export default function Avatar({ name, src, size = 40, color, className }: AvatarProps) {
  const bg    = color ?? (name ? colorFor(name) : '#555')
  const style = { width: size, height: size, borderRadius: Math.round(size * 0.28) }

  if (src) return (
    <img src={src} alt={name ?? ''} style={style}
      className={cn('object-cover flex-shrink-0', className)} />
  )

  return (
    <div style={{ ...style, background: `linear-gradient(135deg, ${bg}22, rgba(255,255,255,0.72))`, border: `1px solid ${bg}44`, boxShadow: '0 1px 0 rgba(255,255,255,0.75) inset' }}
      className={cn('flex items-center justify-center flex-shrink-0', className)}>
      <span style={{ color: bg, fontSize: size * 0.42, fontFamily: 'var(--font-barlow)', fontWeight: 900, lineHeight: 1 }}>
        {getInitial(name)}
      </span>
    </div>
  )
}
