'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Bell,
  ChevronDown,
  Grid3X3,
  Home,
  MapPin,
  Menu,
  MessageCircle,
  Plus,
  User,
  Users,
  X,
} from 'lucide-react'
import BottomNav from '@/components/shared/BottomNav'
import Avatar from '@/components/shared/Avatar'
import { useAuth } from '@/hooks/useAuth'
import { useSocket } from '@/hooks/useSocket'
import { getBadges } from '@/lib/api'
import { cn } from '@/lib/utils'

const desktopNavItems = [
  { href: '/feed', icon: Home, label: 'Feed', badgeKey: undefined },
  { href: '/groups', icon: Users, label: 'Groups', badgeKey: 'groups' },
  { href: '/chats', icon: MessageCircle, label: 'Chats', badgeKey: 'chats' },
  { href: '/profile', icon: User, label: 'Profile', badgeKey: undefined },
] as const

const mobileNavItems = [
  ...desktopNavItems,
  { href: '/alerts', icon: Bell, label: 'Notifications', badgeKey: 'notifications' },
] as const

type BadgeCounts = {
  notifications: number
  groups: number
  chats: number
}

function BrandMark() {
  return (
    <div className="flex items-center gap-3">
      <div className="relative grid h-[52px] w-[52px] place-items-center rounded-[16px] bg-[#075CFF] text-white shadow-[0_16px_36px_rgba(7,92,255,0.22)]">
        <MapPin size={30} strokeWidth={2.7} />
        <div className="absolute -bottom-1.5 h-2 w-8 rounded-full bg-[#075CFF]/25 blur-[1px]" />
      </div>
      <div>
        <div className="font-body text-[28px] font-black leading-none tracking-[-0.055em] text-[#081234]">
          PinLocal
        </div>
        <div className="mt-1 text-[12px] font-bold tracking-[-0.01em] text-[#697391]">
          Neighbourhood network
        </div>
      </div>
    </div>
  )
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [badges, setBadges] = useState<BadgeCounts>({ notifications: 0, groups: 0, chats: 0 })
  const { user } = useAuth(false)
  const socket = useSocket()

  const refreshBadges = useCallback(async () => {
    try {
      const res = await getBadges()
      setBadges(res.data.badges ?? { notifications: 0, groups: 0, chats: 0 })
    } catch {}
  }, [])

  useEffect(() => {
    refreshBadges()
  }, [pathname, refreshBadges])

  useEffect(() => {
    const handleFocus = () => refreshBadges()
    const handleRefresh = () => refreshBadges()
    window.addEventListener('focus', handleFocus)
    window.addEventListener('pinlocal:badges-refresh', handleRefresh)
    const timer = window.setInterval(refreshBadges, 30000)
    return () => {
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('pinlocal:badges-refresh', handleRefresh)
      window.clearInterval(timer)
    }
  }, [refreshBadges])

  useEffect(() => {
    if (!socket) return
    const applyBadges = ({ badges: nextBadges }: { badges: BadgeCounts }) => {
      setBadges(nextBadges ?? { notifications: 0, groups: 0, chats: 0 })
    }
    socket.on('badge_counts_updated', applyBadges)
    return () => {
      socket.off('badge_counts_updated', applyBadges)
    }
  }, [socket])

  const badgeFor = useCallback((key?: keyof BadgeCounts) => {
    if (!key) return 0
    return badges[key] ?? 0
  }, [badges])

  return (
    <div className="min-h-screen bg-[#FBFCFF] text-[#081234]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[250px] border-r border-[#E4E9F4] bg-white/95 backdrop-blur-xl xl:block">
        <div className="flex h-full flex-col px-5 py-7">
          <Link href="/feed" className="mb-9 block">
            <BrandMark />
          </Link>

          <nav className="space-y-3">
            {desktopNavItems.map(item => {
              const Icon = item.icon
              const active = pathname.startsWith(item.href)
              const badge = badgeFor(item.badgeKey)
              return (
                <Link
                  key={`${item.label}-${item.href}`}
                  href={item.href}
                  className={cn(
                    'group flex h-12 items-center gap-3 rounded-[8px] px-4 text-[14px] font-bold transition-all',
                    active ? 'bg-[#F1F5FF] text-[#075CFF]' : 'text-[#172143] hover:bg-[#F6F8FF] hover:text-[#075CFF]'
                  )}
                >
                  <Icon size={20} strokeWidth={active ? 3 : 2.2} fill={active && item.label === 'Feed' ? '#075CFF' : 'none'} />
                  <span className="min-w-0 flex-1">{item.label}</span>
                  {badge > 0 && (
                    <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#075CFF] px-1.5 text-[11px] font-black text-white">
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                </Link>
              )
            })}
          </nav>

          <div className="mt-auto space-y-6">
            <div className="rounded-[12px] border border-[#E1E7F3] bg-white p-4 shadow-[0_18px_46px_rgba(39,71,124,0.07)]">
              <p className="text-[12px] font-semibold text-[#697391]">Your Pincode</p>
              <div className="mt-3 flex items-center gap-3">
                <MapPin size={20} className="text-[#075CFF]" />
                <span className="text-[18px] font-black text-[#081234]">{user?.primary_pincode ?? '400001'}</span>
                <button className="ml-auto text-[12px] font-black text-[#075CFF]">Change</button>
              </div>
              <div className="mt-5 flex items-end justify-between gap-3">
                <p className="text-[12px] font-medium leading-relaxed text-[#697391]">
                  Expanding to nearby areas<br />(1.5 km radius)
                </p>
                <span className="grid h-4 w-4 place-items-center rounded-full border border-[#AEB8CE] text-[10px] font-bold text-[#697391]">i</span>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-[12px] border border-[#E1E7F3] bg-[#F7FAFF] p-4 shadow-[0_18px_46px_rgba(39,71,124,0.07)]">
              <p className="text-[15px] font-black text-[#081234]">Invite your neighbours!</p>
              <p className="mt-3 max-w-[150px] text-[14px] font-medium leading-relaxed text-[#697391]">
                The more people, the stronger our community.
              </p>
              <button className="mt-3 rounded-[8px] border border-[#075CFF] px-4 py-2 text-[12px] font-black text-[#075CFF]">
                Invite Now
              </button>
              <div className="absolute bottom-1 right-2 flex -space-x-2">
                <Avatar name="A" size={28} className="rounded-full border-2 border-white" />
                <Avatar name="B" size={28} className="rounded-full border-2 border-white" />
                <Avatar name="C" size={28} className="rounded-full border-2 border-white" />
              </div>
            </div>

            <div className="px-2 text-[11px] font-medium leading-6 text-[#697391]">
              <p>© 2024 PinLocal</p>
              <p>Privacy&nbsp;&nbsp;•&nbsp;&nbsp;Terms&nbsp;&nbsp;•&nbsp;&nbsp;Help</p>
            </div>
          </div>
        </div>
      </aside>

      <header className="fixed left-0 right-0 top-0 z-40 border-b border-[#E4E9F4] bg-white/95 px-4 py-3 backdrop-blur-xl xl:hidden">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <Link href="/feed" className="flex items-center gap-2 font-body text-[20px] font-black uppercase leading-none tracking-[-0.04em] text-[#081234]">
            <Grid3X3 size={22} className="text-[#075CFF]" />
            PinLocal
          </Link>
          <button
            onClick={() => setOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-[8px] border border-[#E4E9F4] bg-white active:scale-95"
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
        </div>
      </header>

      {open && (
        <div className="fixed inset-0 z-[80] xl:hidden">
          <button className="absolute inset-0 bg-[#081234]/30 backdrop-blur-sm" onClick={() => setOpen(false)} aria-label="Close menu" />
          <div className="absolute right-3 top-3 w-[min(360px,calc(100vw-24px))] rounded-[14px] border border-[#E4E9F4] bg-white p-4 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div className="font-body text-[22px] font-black">Menu</div>
              <button onClick={() => setOpen(false)} className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-[#F1F5FF]">
                <X size={18} />
              </button>
            </div>
            <nav className="space-y-2">
              {mobileNavItems.map(item => {
                const Icon = item.icon
                const active = pathname.startsWith(item.href)
                const badge = badgeFor(item.badgeKey)
                return (
                  <Link
                    key={`${item.label}-mobile`}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      'flex h-11 items-center gap-3 rounded-[8px] px-3 text-[14px] font-semibold',
                      active ? 'bg-[#075CFF] text-white' : 'bg-[#F6F8FF] text-[#172143]'
                    )}
                  >
                    <Icon size={18} />
                    <span className="min-w-0 flex-1">{item.label}</span>
                    {badge > 0 && (
                      <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#075CFF] px-1.5 text-[11px] font-black text-white">
                        {badge > 99 ? '99+' : badge}
                      </span>
                    )}
                  </Link>
                )
              })}
            </nav>
          </div>
        </div>
      )}

      <main className="min-h-screen pt-[65px] pb-[96px] xl:ml-[250px] xl:pt-0 xl:pb-0">
        {children}
      </main>

      <div className="xl:hidden">
        <BottomNav />
      </div>
    </div>
  )
}
