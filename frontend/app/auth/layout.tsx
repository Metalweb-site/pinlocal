export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden bg-bg">
      {/* Grid background */}
      <div className="fixed inset-0 pointer-events-none" style={{
        backgroundImage: 'linear-gradient(#2A2A2A 1px,transparent 1px),linear-gradient(90deg,#2A2A2A 1px,transparent 1px)',
        backgroundSize: '40px 40px', opacity: .2
      }} />
      {/* Coral glow */}
      <div className="fixed inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 80% 55% at 15% 90%, rgba(255,77,0,.13) 0%, transparent 55%)'
      }} />
      {/* Mint glow */}
      <div className="fixed inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 50% 40% at 85% 10%, rgba(0,255,178,.06) 0%, transparent 50%)'
      }} />
      <div className="relative z-10 flex flex-col flex-1">{children}</div>
    </div>
  )
}
