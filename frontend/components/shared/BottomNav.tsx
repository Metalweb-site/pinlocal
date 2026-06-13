'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Grid, Bell, User, Plus, MessageCircle } from 'lucide-react'

const tabs = [
  { href: '/feed',    icon: Home,  label: 'Feed' },
  { href: '/groups',  icon: Grid,  label: 'Groups' },
  { href: '/create',  icon: Plus,  label: '' },
  { href: '/chats',   icon: MessageCircle, label: 'Chats' },
  { href: '/alerts',  icon: Bell,  label: 'Alerts' },
]

export default function BottomNav() {
  const path = usePathname()

  return (
    <nav className="fixed bottom-3 left-3 right-3 z-50 mx-auto flex max-w-2xl items-center justify-around rounded-[12px] border border-border bg-surface/90 px-2 shadow-[0_10px_28px_rgba(21,25,20,0.12)] backdrop-blur-xl" style={{ height: '72px', paddingBottom: 'env(safe-area-inset-bottom, 6px)' }}>
      {tabs.map(({ href, icon: Icon, label }) => {
        const isCreate = href === '/create'
        const active   = path.startsWith(href) && !isCreate

        if (isCreate) return (
          <Link key={href} href={href} className="flex items-center justify-center -mt-8">
            <div className="w-14 h-14 rounded-[10px] bg-text1 flex items-center justify-center border border-text1 active:scale-95 transition-all duration-200">
              <div>
                <Plus size={28} color="#fff" strokeWidth={3} />
              </div>
            </div>
          </Link>
        )

        return (
          <Link key={href} href={href}
            className="relative flex flex-1 flex-col items-center gap-1.5 rounded-[8px] py-2.5 transition-all active:scale-95 hover:bg-surface2">
            {active && (
              <div className="absolute inset-x-5 top-1 h-[2px] rounded-full bg-text1" />
            )}
            <Icon size={24} strokeWidth={active ? 2.5 : 2}
              className={`transition-colors duration-200 ${active ? 'text-text1' : 'text-text3 group-hover:text-text2'}`} />
            <span className={`text-[10px] font-bold transition-colors duration-200 ${active ? 'text-text1' : 'text-text3'}`}>
              {label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
