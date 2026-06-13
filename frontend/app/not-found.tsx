import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center px-8 text-center relative overflow-hidden">
      {/* Grid */}
      <div className="fixed inset-0 pointer-events-none" style={{
        backgroundImage: 'linear-gradient(#2A2A2A 1px,transparent 1px),linear-gradient(90deg,#2A2A2A 1px,transparent 1px)',
        backgroundSize:'44px 44px', opacity:.2
      }} />
      {/* Glow */}
      <div className="fixed inset-0 pointer-events-none" style={{
        background:'radial-gradient(ellipse 70% 50% at 50% 55%, rgba(255,77,0,.09) 0%, transparent 60%)'
      }} />

      {/* City illustration */}
      <div className="relative w-48 h-36 mb-8 z-10">
        {[
          { left:8,  width:28, height:80 },
          { left:46, width:38, height:110 },
          { left:96, width:32, height:68 },
          { left:138,width:24, height:52 },
        ].map((b, i) => (
          <div key={i} className="absolute bottom-0 bg-surface border border-border"
            style={{ left:b.left, width:b.width, height:b.height, borderRadius:'2px 2px 0 0' }} />
        ))}
        {/* Pin */}
        <div className="absolute" style={{ bottom:95, left:'48%', transform:'translateX(-50%)' }}>
          <svg width="28" height="28" viewBox="0 0 24 24">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#FF4D00"/>
            <circle cx="12" cy="9" r="2.5" fill="#0F0F0F"/>
          </svg>
        </div>
        <div className="absolute" style={{
          bottom:88, left:'50%', transform:'translateX(-50%)',
          width:40, height:6, background:'rgba(255,77,0,.35)',
          borderRadius:'50%', filter:'blur(5px)'
        }} />
      </div>

      <h1 className="font-display font-black text-[64px] uppercase leading-[.88] mb-3 z-10">
        YOU ARE<br /><span className="text-coral">THE</span><br />FIRST.
      </h1>
      <p className="text-text2 text-[14px] leading-relaxed max-w-[270px] mb-10 z-10">
        This page does not exist. But your neighbourhood does - go explore it.
      </p>
      <div className="flex flex-col gap-3 w-full max-w-[300px] z-10">
        <Link href="/feed"
          className="flex items-center justify-center h-[54px] rounded-[14px] bg-coral text-white font-display text-[20px] font-bold uppercase tracking-widest"
          style={{ boxShadow:'0 8px 24px rgba(255,77,0,.28)' }}>
          Back to Feed →
        </Link>
        <Link href="/create"
          className="flex items-center justify-center h-[48px] rounded-[14px] border border-border text-text2 text-[14px] font-semibold">
          Create a Group
        </Link>
      </div>
    </div>
  )
}
