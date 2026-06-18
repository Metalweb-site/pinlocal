'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ChevronRight, Home, Search, Plus, MessageCircle, Users, FilePenLine, CalendarDays } from 'lucide-react'

const tabs = [
  { href: '/feed',    icon: Home,  label: 'Feed' },
  { href: '/groups',  icon: Users,  label: 'Groups' },
  { href: '/create',  icon: Plus,  label: '' },
  { href: '/chats',   icon: MessageCircle, label: 'Chats' },
  { href: '/search',  icon: Search,  label: 'Search' },
]

export default function BottomNav() {
  const path = usePathname()
  const router = useRouter()
  const [createOpen, setCreateOpen] = useState(false)

  useEffect(() => {
    setCreateOpen(false)
  }, [path])

  return (
    <>
      {createOpen && (
        <div className="fixed inset-0 z-[90] xl:hidden">
          <button
            className="absolute inset-0 bg-[#081234]/32 backdrop-blur-[2px]"
            onClick={() => setCreateOpen(false)}
            aria-label="Close create menu"
          />
          <div
            className="absolute inset-x-0 bottom-0 rounded-t-[28px] bg-white px-5 pb-[calc(env(safe-area-inset-bottom,0px)+18px)] pt-5 shadow-[0_-24px_60px_rgba(8,18,52,0.18)]"
            role="dialog"
            aria-modal="true"
            aria-label="Create menu"
          >
            <div className="mx-auto mb-5 h-1.5 w-12 rounded-full bg-[#D8E0EF]" />
            <div className="space-y-3">
              <CreateActionCard
                icon={<FilePenLine size={22} className="text-white" />}
                iconBg="bg-[#075CFF]"
                title="Create Post"
                description="Share updates, ask questions, or start a conversation."
                onClick={() => {
                  setCreateOpen(false)
                  router.push('/create?mode=post')
                }}
              />
              <CreateActionCard
                icon={<CalendarDays size={22} className="text-white" />}
                iconBg="bg-[#16A34A]"
                title="Create Event"
                description="Organize or promote an event in your neighbourhood."
                onClick={() => {
                  setCreateOpen(false)
                  router.push('/create?mode=event')
                }}
              />
            </div>
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="mt-5 flex h-12 w-full items-center justify-center rounded-[14px] text-[15px] font-bold text-[#44506E] active:scale-[0.99]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <nav className="fixed bottom-0 left-0 right-0 z-50 mx-auto flex max-w-2xl items-center justify-around rounded-t-[28px] border-t border-[#E4E9F4] bg-white px-2 shadow-[0_-12px_34px_rgba(8,18,52,0.08)] xl:hidden" style={{ height: '88px', paddingBottom: 'env(safe-area-inset-bottom, 12px)' }}>
        {tabs.map(({ href, icon: Icon, label }) => {
          const isCreate = href === '/create'
          const active = path.startsWith(href) && !isCreate

          if (isCreate) {
            return (
              <button
                key={href}
                type="button"
                onClick={() => setCreateOpen(true)}
                className="flex -mt-8 items-center justify-center active:scale-95"
                aria-label="Open create menu"
                aria-expanded={createOpen}
                aria-haspopup="dialog"
              >
                <div className="flex h-[58px] w-[58px] items-center justify-center rounded-full border border-[#075CFF] bg-[#075CFF] shadow-[0_12px_26px_rgba(7,92,255,0.28)] transition-all duration-200">
                  <div>
                    <Plus size={28} color="#fff" strokeWidth={3} />
                  </div>
                </div>
              </button>
            )
          }

          return (
            <Link key={href} href={href}
              className="relative flex flex-1 flex-col items-center gap-1.5 rounded-[14px] py-2.5 transition-all active:scale-95">
              <Icon size={24} strokeWidth={active ? 2.5 : 2}
                className={`transition-colors duration-200 ${active ? 'text-[#075CFF]' : 'text-[#081234]'}`} />
              <span className={`text-[11px] font-bold transition-colors duration-200 ${active ? 'text-[#075CFF]' : 'text-[#44506E]'}`}>
                {label}
              </span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}

function CreateActionCard({
  icon,
  iconBg,
  title,
  description,
  onClick,
}: {
  icon: React.ReactNode
  iconBg: string
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-4 rounded-[18px] border border-[#E7ECF5] bg-[#F9FBFF] px-4 py-4 text-left shadow-[0_10px_26px_rgba(8,18,52,0.06)] active:scale-[0.99]"
    >
      <div className={`grid h-12 w-12 flex-shrink-0 place-items-center rounded-[14px] ${iconBg}`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-black text-[#081234]">{title}</div>
        <div className="mt-1 text-[12px] font-semibold leading-relaxed text-[#697391]">{description}</div>
      </div>
      <ChevronRight size={18} className="flex-shrink-0 text-[#94A3B8]" />
    </button>
  )
}
