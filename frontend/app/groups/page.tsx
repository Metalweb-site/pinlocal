'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Bell,
  CalendarDays,
  ChevronDown,
  GraduationCap,
  Grid2X2,
  HeartHandshake,
  Loader2,
  MapPin,
  MoreVertical,
  Plus,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  Trophy,
  Users,
} from 'lucide-react'
import { getMyGroups, joinGroup } from '@/lib/api'
import { Group, getCategoryColor } from '@/types'
import { useAuth } from '@/hooks/useAuth'
import Avatar from '@/components/shared/Avatar'
import NotificationBell from '@/components/shared/NotificationBell'
import PincodeSwitcher from '@/components/shared/PincodeSwitcher'
import { formatCount } from '@/lib/utils'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/store/auth.store'

const FILTERS = [
  { label: 'All', icon: Grid2X2 },
  { label: 'Sports', icon: Trophy },
  { label: 'Events', icon: CalendarDays },
  { label: 'Help', icon: HeartHandshake },
  { label: 'Buy/Sell', icon: ShoppingBag },
  { label: 'Education', icon: GraduationCap },
  { label: 'More', icon: ChevronDown },
]

export default function GroupsPage() {
  const { user, loading: authLoading } = useAuth()
  const { activePincode } = useAuthStore()
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    if (!authLoading) {
      getMyGroups()
        .then(r => setGroups(r.data.groups ?? []))
        .catch(() => {})
        .finally(() => setLoading(false))
    }
  }, [authLoading])

  const myGroups = groups.slice(0, 4)
  const discoverGroups = useMemo(() => groups.slice(4).map(g => ({
    id: g.id,
    name: g.name,
    category: g.category,
    pincode: g.pincode,
    member_count: g.member_count,
    description: g.description ?? `Local ${g.category.toLowerCase()} community in your area.`,
    cover_image_url: g.cover_image_url,
  })), [groups])
  const suggested = useMemo(() => groups.slice(0, 4), [groups])

  const handleJoin = async (groupId: string) => {
    setJoining(groupId)
    try {
      const res = await joinGroup(groupId)
      toast.success(res.data.status === 'joined' ? 'Joined group' : 'Join request sent')
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? 'Could not join group')
    } finally {
      setJoining(null)
    }
  }

  const openGroup = (group: Group) => {
    if (group.default_thread_id) {
      router.push(`/groups/${group.id}/threads/${group.default_thread_id}`)
      return
    }
    toast.error('No chat thread found for this group')
  }

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#FBFCFF]">
        <Loader2 size={28} className="animate-spin text-[#075CFF]" />
        <p className="mt-4 text-[12px] font-semibold text-[#697391]">Loading groups</p>
      </div>
    )
  }

  const pincode = activePincode || user?.primary_pincode || '400001'
  const userName = user?.username ?? 'Sujal'

  return (
    <div className="min-h-screen bg-[#FBFCFF] font-body text-[#081234]">
      <MobileGroupsTopBar userName={userName} avatarUrl={user?.avatar_url} />
      <div className="hidden xl:block">
        <header className="sticky top-0 z-30 border-b border-[#E4E9F4] bg-white/90 backdrop-blur-xl">
          <div className="mx-auto flex h-[80px] max-w-[1220px] items-center gap-8 px-9">
            <PincodeSwitcher variant="desktop-header" />

            <div className="mx-auto flex h-10 w-[550px] items-center rounded-[8px] border border-[#D7DFF0] bg-white px-4 shadow-[0_10px_30px_rgba(40,70,120,0.06)]">
              <Search size={20} className="mr-3 text-[#697391]" />
              <input className="min-w-0 flex-1 bg-transparent text-[14px] font-semibold text-[#081234] outline-none placeholder:text-[#8B96B2]" placeholder="Search groups by name or category..." />
              <span className="rounded-[6px] border border-[#E4E9F4] px-2 py-0.5 text-[12px] font-bold text-[#697391]">K</span>
            </div>

            <NotificationBell />
            <div className="flex items-center gap-3">
              <Avatar name={userName} src={user?.avatar_url} size={38} className="!rounded-full" />
              <span className="text-[14px] font-black">{userName}</span>
              <ChevronDown size={16} />
            </div>
          </div>
        </header>
      </div>

      <div className="mx-auto grid max-w-[1220px] grid-cols-1 gap-8 px-6 pt-4 xl:grid-cols-[minmax(0,1fr)_272px] xl:px-9 xl:pt-7">
        <main className="min-w-0">
          <section className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h1 className="text-[34px] font-black leading-none tracking-[-0.045em] text-[#081234]">Groups</h1>
              <p className="mt-3 text-[15px] font-semibold text-[#697391]">Find and join communities in your area</p>
            </div>
            <Link href="/create?mode=group" className="flex h-12 items-center gap-3 rounded-[8px] bg-[#075CFF] px-5 text-[14px] font-black text-white shadow-[0_16px_34px_rgba(7,92,255,0.25)] transition-transform active:scale-95 xl:px-7 xl:text-[15px]">
              <Plus size={20} />
              Create Group
            </Link>
          </section>

          <section className="mb-5 flex gap-5">
            <div className="flex h-12 min-w-0 flex-1 items-center rounded-[9px] border border-[#D7DFF0] bg-white px-4 shadow-[0_10px_30px_rgba(40,70,120,0.04)]">
              <Search size={20} className="mr-3 text-[#697391]" />
              <input className="min-w-0 flex-1 bg-transparent text-[14px] font-semibold text-[#081234] outline-none placeholder:text-[#8B96B2]" placeholder="Search groups by name or category" />
            </div>
            <button className="hidden h-12 items-center gap-3 rounded-[9px] border border-[#D7DFF0] bg-white px-6 text-[14px] font-black text-[#081234] shadow-[0_10px_30px_rgba(40,70,120,0.04)] xl:flex">
              <SlidersHorizontal size={19} />
              Filters
            </button>
          </section>

          <section className="mb-7 hidden overflow-x-auto scrollbar-none xl:block">
            <div className="flex min-w-max gap-4">
              {FILTERS.map((item, index) => {
                const Icon = item.icon
                const active = index === 0
                return (
                  <button key={item.label} className={`flex h-11 items-center gap-2 rounded-full border px-5 text-[14px] font-bold transition-all ${active ? 'border-[#9CB9FF] bg-[#EEF4FF] text-[#075CFF]' : 'border-[#E1E7F3] bg-white text-[#172143] hover:border-[#9CB9FF] hover:text-[#075CFF]'}`}>
                    <Icon size={19} />
                    {item.label}
                  </button>
                )
              })}
            </div>
          </section>

          <SectionTitle title="My Groups" action="View all" />
          {myGroups.length === 0 ? (
            <EmptyState title="No groups yet" body="Join community conversations by interacting with posts in your feed, or create your first group." actionHref="/create?mode=group" action="Create Group" />
          ) : (
            <div className="mb-7 overflow-hidden rounded-[12px] border border-[#E1E7F3] bg-white shadow-[0_12px_28px_rgba(30,56,104,0.06)] md:grid-cols-2 xl:grid xl:gap-5 xl:overflow-visible xl:rounded-none xl:border-0 xl:bg-transparent xl:shadow-none xl:grid-cols-4">
              {myGroups.map(g => (
                <article key={g.id} className="relative flex items-center gap-4 border-b border-[#EDF1F8] bg-white p-4 text-left last:border-b-0 xl:block xl:rounded-[12px] xl:border xl:border-[#DDE5F3] xl:p-5 xl:text-center xl:shadow-[0_18px_44px_rgba(30,56,104,0.07)] xl:transition-all xl:hover:-translate-y-0.5 xl:hover:shadow-[0_22px_52px_rgba(30,56,104,0.10)]">
                  <div className="relative mx-auto w-fit">
                    <button
                      type="button"
                      onClick={() => router.push(`/groups/${g.id}`)}
                      className="rounded-full transition-transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-[#C9D6FF]"
                      aria-label={`Open ${g.name} details`}
                    >
                      <Avatar name={g.name} src={g.cover_image_url} size={74} className="!rounded-[10px] xl:!rounded-full" />
                    </button>
                    <span className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-2 border-white bg-[#18B957]" />
                    {(g.unread_count ?? 0) > 0 && (
                      <span className="absolute -right-3 -top-2 grid h-6 min-w-6 place-items-center rounded-full bg-[#075CFF] px-1.5 text-[11px] font-black text-white shadow-[0_10px_22px_rgba(7,92,255,0.25)]">
                        {(g.unread_count ?? 0) > 99 ? '99+' : g.unread_count}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 xl:contents">
                  <h3 className="truncate text-[16px] font-black xl:mt-4">{g.name}</h3>
                  <p className="mt-2 text-[13px] font-semibold text-[#697391]">{formatCount(g.member_count)} members</p>
                  <p className="mt-2 flex items-center gap-1 text-[13px] font-semibold text-[#697391] xl:hidden"><MapPin size={14} /> {g.pincode}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openGroup(g)}
                    className="ml-auto inline-flex rounded-[8px] border border-[#C9D6FF] bg-white px-4 py-3 text-[12px] font-black text-[#075CFF] transition-colors hover:bg-[#DDE8FF] xl:ml-0 xl:mt-4 xl:rounded-[6px] xl:border-0 xl:bg-[#EAF2FF] xl:px-3 xl:py-1.5"
                  >
                    Open Group
                  </button>
                </article>
              ))}
            </div>
          )}

          <div className="mb-8 rounded-[12px] bg-[#F3F7FF] p-7 text-center xl:hidden">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-white text-[#075CFF]"><Users size={24} /></div>
            <h2 className="mt-4 text-[16px] font-black">Can&apos;t find the right community?</h2>
            <p className="mt-2 text-[13px] font-semibold leading-relaxed text-[#697391]">Create your own group and bring your neighbourhood together.</p>
            <Link href="/create?mode=group" className="mt-4 inline-flex rounded-[8px] border border-[#C9D6FF] bg-white px-8 py-3 text-[13px] font-black text-[#075CFF]">Create Group</Link>
          </div>

          <SectionTitle title="Suggested for You" action="See all" />
          <div className="overflow-hidden rounded-[14px] border border-[#DDE5F3] bg-white shadow-[0_18px_44px_rgba(30,56,104,0.07)]">
            {discoverGroups.length === 0 ? (
              <EmptyState title="No groups to discover yet" body="Groups you have not joined will appear here when available." compact />
            ) : discoverGroups.map((g, index) => (
              <div key={g.id} className="grid gap-4 border-b border-[#EDF1F8] p-3 last:border-b-0 md:grid-cols-[116px_minmax(0,1fr)_110px_70px] md:items-center">
                <GroupThumb group={g} index={index} />
                <div className="min-w-0">
                  <span className="rounded-[6px] px-2 py-1 text-[11px] font-black" style={{ background: `${getCategoryColor(g.category)}18`, color: getCategoryColor(g.category) }}>{labelCategory(g.category)}</span>
                  <h3 className="mt-2 truncate text-[17px] font-black">{g.name}</h3>
                  <p className="mt-1 truncate text-[13px] font-semibold text-[#697391]">{g.description}</p>
                  <p className="mt-2 flex flex-wrap items-center gap-2 text-[12px] font-semibold text-[#697391]">
                    <MapPin size={14} className="text-[#081234]" />
                    {g.pincode}
                    <span>&bull;</span>
                    {formatCount(g.member_count)} members
                  </p>
                </div>
                <div className="text-[12px] font-semibold text-[#697391] md:text-right">{g.pincode}</div>
                <div className="flex items-center justify-between gap-3 md:justify-end">
                  <button className="grid h-9 w-9 place-items-center rounded-full text-[#081234] hover:bg-[#F5F8FF]">
                    <MoreVertical size={18} />
                  </button>
                  <button onClick={() => handleJoin(g.id)} disabled={joining === g.id} className="h-9 rounded-[7px] bg-[#075CFF] px-6 text-[13px] font-black text-white shadow-[0_10px_24px_rgba(7,92,255,0.20)] disabled:opacity-60">
                    {joining === g.id ? <Loader2 size={15} className="animate-spin" /> : 'Join'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </main>

        <aside className="hidden space-y-4 xl:block">
          <section className="rounded-[12px] border border-[#E1E7F3] bg-white p-5 shadow-[0_18px_48px_rgba(30,56,104,0.06)]">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-[14px] font-black">Suggested for You</h2>
            </div>
            {suggested.length === 0 ? (
              <EmptyState title="No suggested groups" body="Suggestions will appear when real groups are available." compact />
            ) : (
              <div className="space-y-0">
                {suggested.map((g, index) => (
                  <div key={g.id} className="flex gap-3 border-b border-[#EDF1F8] py-4 first:pt-0 last:border-b-0 last:pb-0">
                    <GroupThumb group={g} index={index} small />
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-[13px] font-black">{g.name}</h3>
                      <p className="mt-1 text-[12px] font-semibold text-[#697391]">{formatCount(g.member_count)} members</p>
                      <p className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-[#697391]"><MapPin size={12} /> {g.pincode}</p>
                    </div>
                    <button onClick={() => handleJoin(g.id)} className="self-end rounded-[7px] border border-[#9CB9FF] px-4 py-2 text-[12px] font-black text-[#075CFF]">Join</button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-[12px] border border-[#E1E7F3] bg-[#F4F8FF] p-5 text-center shadow-[0_18px_48px_rgba(30,56,104,0.06)]">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#EAF2FF] text-[#075CFF]"><Users size={25} /></div>
            <h2 className="mt-3 text-[14px] font-black">Can&apos;t find the right community?</h2>
            <p className="mx-auto mt-2 max-w-[190px] text-[12px] font-semibold leading-relaxed text-[#697391]">Create your own group and bring your neighbourhood together.</p>
            <Link href="/create?mode=group" className="mt-4 inline-flex rounded-[7px] border border-[#9CB9FF] bg-white px-8 py-3 text-[13px] font-black text-[#075CFF]">Create Group</Link>
          </section>
        </aside>
      </div>
    </div>
  )
}

function SectionTitle({ title, action }: { title: string; action: string }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h2 className="text-[17px] font-black tracking-[-0.02em]">{title}</h2>
      <button className="text-[13px] font-black text-[#075CFF]">{action}</button>
    </div>
  )
}

function GroupThumb({ group, index, small = false }: { group: { name: string; cover_image_url?: string | null; category?: string }; index: number; small?: boolean }) {
  if (small) return <Avatar name={group.name} src={group.cover_image_url} size={68} className="!rounded-[8px]" />
  const src = group.cover_image_url
  if (src) return <img src={src} alt="" className="h-[88px] w-[116px] flex-shrink-0 rounded-[8px] object-cover" />
  const icons = [CalendarDays, HeartHandshake, Users, ShoppingBag]
  const Icon = icons[index % icons.length]
  return (
    <div className="grid h-[88px] w-[116px] flex-shrink-0 place-items-center rounded-[8px] bg-[#F1F5FF] text-[#075CFF]">
      <Icon size={34} />
    </div>
  )
}

function EmptyState({ title, body, actionHref, action, compact = false }: { title: string; body: string; actionHref?: string; action?: string; compact?: boolean }) {
  return (
    <div className={`text-center ${compact ? 'p-6' : 'mb-7 rounded-[14px] border border-dashed border-[#D7DFF0] bg-white p-10'}`}>
      <Users size={compact ? 22 : 30} className="mx-auto text-[#8B96B2]" />
      <h2 className="mt-4 text-[20px] font-black">{title}</h2>
      <p className="mx-auto mt-2 max-w-sm text-[14px] font-semibold leading-relaxed text-[#697391]">{body}</p>
      {actionHref && action && <Link href={actionHref} className="mt-5 inline-flex rounded-[8px] bg-[#075CFF] px-5 py-3 text-[13px] font-black text-white">{action}</Link>}
    </div>
  )
}

function labelCategory(category: string) {
  if (category === 'Marketplace') return 'Buy/Sell'
  if (category === 'Pets') return 'Pet Care'
  return category
}

function MobileGroupsTopBar({ userName, avatarUrl }: { userName: string; avatarUrl?: string | null }) {
  return (
    <header className="sticky top-0 z-30 bg-[#FBFCFF]/95 px-6 pb-4 pt-7 backdrop-blur-xl xl:hidden">
      <div className="flex items-center justify-between">
        <PincodeSwitcher variant="mobile-topbar" />
        <div className="flex items-center gap-4">
          <NotificationBell />
          <Link href="/profile" aria-label="Open profile">
            <Avatar name={userName} src={avatarUrl} size={40} className="!rounded-full" />
          </Link>
        </div>
      </div>
    </header>
  )
}
