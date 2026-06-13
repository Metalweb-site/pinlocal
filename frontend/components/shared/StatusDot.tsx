export default function StatusDot({ color = '#00FFB2', size = 6 }: { color?: string; size?: number }) {
  return (
    <span style={{ width: size, height: size, borderRadius: '50%', background: color, display: 'inline-block' }}
      className="animate-blink flex-shrink-0" />
  )
}
