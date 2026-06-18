'use client'

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  CalendarDays,
  ChevronDown,
  Flame,
  HandHeart,
  Home,
  Loader2,
  Map as MapIcon,
  MapPin,
  Megaphone,
  MoreHorizontal,
  Search,
  ShoppingBag,
  TrendingUp,
  Plus,
  Zap,
} from 'lucide-react'
import Link from 'next/link'
import { getFeed } from '@/lib/api'
import { useFeedStore } from '@/store/feed.store'
import { useAuth } from '@/hooks/useAuth'
import { useSocket } from '@/hooks/useSocket'
import FeedCard from '@/components/feed/FeedCard'
import Avatar from '@/components/shared/Avatar'
import NotificationBell from '@/components/shared/NotificationBell'
import PincodeSwitcher from '@/components/shared/PincodeSwitcher'
import { useAuthStore } from '@/store/auth.store'
import { CATEGORIES, Post } from '@/types'

const CATS = [
  { label: 'For You', value: 'for_you', icon: Home },
  { label: 'Trending', value: 'trending', icon: TrendingUp },
  { label: 'Viral', value: 'viral', icon: Zap },
  { label: 'Events', value: 'Events', icon: CalendarDays },
  { label: 'Help', value: 'Help', icon: HandHeart },
  { label: 'Buy / Sell', value: 'Buy & Sell', icon: ShoppingBag },
  { label: 'Announcements', value: 'Announcement', icon: Megaphone },
  { label: 'More', value: 'for_you', icon: MoreHorizontal },
]

export default function FeedPage() {
  const { user, loading: authLoading } = useAuth()
  const { activePincode } = useAuthStore()
  useSocket()
  const router = useRouter()
  const {
    posts, page, hasMore, category, loading,
    setPosts, appendPosts, setPage, setHasMore, setCategory, setLoading,
  } = useFeedStore()
  const loaderRef = useRef<HTMLDivElement>(null)
  const fetching = useRef(false)

  const loadFeed = useCallback(async (p: number, cat: string, reset = false) => {
    if (fetching.current || authLoading || !user) return
    fetching.current = true
    setLoading(true)
    try {
      const res = await getFeed(p, cat)
      const { posts: newPosts, hasMore: more } = res.data
      if (reset) setPosts(newPosts)
      else appendPosts(newPosts)
      setPage(p)
      setHasMore(more)
    } catch (e: any) {
      if (e?.response?.status === 401) router.push('/auth/login')
    } finally {
      setLoading(false)
      fetching.current = false
    }
  }, [authLoading, user, setPosts, appendPosts, setPage, setHasMore, setLoading, router])

  useEffect(() => {
    if (!user || authLoading) return
    if (!user.username || !user.bio || !user.location_text || (user.interests ?? []).length === 0) {
      router.push('/auth/profile')
      return
    }
    loadFeed(1, category, true)
  }, [activePincode, category, user, authLoading, loadFeed, router])

  useEffect(() => {
    const obs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore && !loading && !authLoading && user) {
        loadFeed(page + 1, category)
      }
    }, { threshold: 0.1 })
    if (loaderRef.current) obs.observe(loaderRef.current)
    return () => obs.disconnect()
  }, [hasMore, loading, page, category, authLoading, user, loadFeed])

  const handleCatChange = (cat: string) => {
    if (cat === category) return
    setCategory(cat)
  }

  const userName = user?.username ?? 'Sujal'
  const pincode = activePincode || user?.primary_pincode || '400001'
  const nearbyLabel = useMemo(() => CATEGORIES.map(c => c.label).join(', '), [])

  const trendingPosts = useMemo(() => {
    return [...posts]
      .sort((a, b) => {
        const aScore = (a.engagement_score ?? 0) + a.like_count + a.comment_count + (a.swipe_count ?? 0)
        const bScore = (b.engagement_score ?? 0) + b.like_count + b.comment_count + (b.swipe_count ?? 0)
        return bScore - aScore
      })
      .slice(0, 3)
  }, [posts])

  const eventPosts = useMemo(() => {
    return posts.filter(post => (post.category ?? post.group?.category) === 'Events').slice(0, 3)
  }, [posts])

  const nearbyGroups = useMemo(() => {
    const byId = new Map<string, NonNullable<Post['group']> & { postCount: number }>()
    for (const post of posts) {
      if (!post.group) continue
      const existing = byId.get(post.group.id)
      byId.set(post.group.id, {
        ...post.group,
        postCount: (existing?.postCount ?? 0) + 1,
      })
    }
    return Array.from(byId.values()).slice(0, 3)
  }, [posts])

  if (authLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#FBFCFF]">
        <Loader2 size={28} className="animate-spin text-[#075CFF]" />
        <p className="mt-4 text-[12px] font-semibold text-[#697391]">Loading feed</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#FBFCFF] font-body text-[#081234]">
      <MobileTopBar userName={userName} avatarUrl={user?.avatar_url} />
      <div className="hidden xl:block">
        <header className="sticky top-0 z-30 border-b border-[#E4E9F4] bg-white/90 backdrop-blur-xl">
          <div className="mx-auto flex h-[80px] max-w-[1220px] items-center gap-8 px-9">
            <PincodeSwitcher variant="desktop-header" />

            <div className="mx-auto flex h-10 w-[510px] items-center rounded-[8px] border border-[#D7DFF0] bg-white px-4 shadow-[0_10px_30px_rgba(40,70,120,0.06)]">
              <Search size={20} className="mr-3 text-[#697391]" />
              <input
                className="min-w-0 flex-1 bg-transparent text-[14px] font-semibold text-[#081234] outline-none placeholder:text-[#8B96B2]"
                placeholder="Search communities, people, events..."
              />
              <span className="rounded-[6px] border border-[#E4E9F4] px-2 py-0.5 text-[12px] font-bold text-[#697391]">K</span>
            </div>

            <NotificationBell />
            <div className="flex items-center gap-3">
              <Avatar name={userName} src={user?.avatar_url} size={34} className="!rounded-full" />
              <span className="text-[14px] font-black">{userName}</span>
              <ChevronDown size={16} />
            </div>
          </div>
        </header>
      </div>

      <div className="mx-auto grid max-w-[1220px] grid-cols-1 gap-8 px-6 pt-4 xl:grid-cols-[minmax(0,1fr)_280px] xl:px-9 xl:pt-7">
        <main className="min-w-0">
          <section className="mb-5 hidden items-end justify-between gap-4 xl:flex">
            <div>
              <p className="text-[16px] font-semibold text-[#697391]">Good evening, {userName}!</p>
              <h1 className="mt-2 text-[38px] font-black leading-[1.05] tracking-[-0.045em] text-[#081234]">
                Your <span className="text-[#075CFF]">neighbourhood</span> is talking.
              </h1>
              <p className="mt-2 text-[14px] font-semibold text-[#697391]">Real people. Real places. Real conversations.</p>
            </div>
            <div className="hidden items-center gap-3 lg:flex">
              <Link href="/create?mode=post" className="flex h-11 items-center gap-2 rounded-[9px] bg-[#075CFF] px-5 text-[14px] font-black text-white shadow-[0_12px_28px_rgba(7,92,255,0.16)] transition-transform active:scale-95">
                <Plus size={19} />
                Create Post
              </Link>
              <Link href="/create?mode=event" className="flex h-11 items-center gap-2 rounded-[9px] border border-[#C9D6FF] bg-white px-5 text-[14px] font-black text-[#075CFF] shadow-[0_12px_28px_rgba(7,92,255,0.08)] transition-transform active:scale-95">
                <CalendarDays size={19} />
                Register Event
              </Link>
              <button className="flex h-11 items-center gap-3 rounded-[9px] border border-[#C9D6FF] bg-white px-5 text-[14px] font-black text-[#075CFF] shadow-[0_12px_28px_rgba(7,92,255,0.08)]">
                <MapIcon size={21} />
                Map View
              </button>
            </div>
          </section>

          <section className="mb-6 overflow-x-auto rounded-none border-0 bg-transparent p-0 shadow-none scrollbar-none xl:mb-9 xl:rounded-[14px] xl:border xl:border-[#DDE5F3] xl:bg-white xl:p-1.5 xl:shadow-[0_14px_36px_rgba(30,56,104,0.08)]">
            <div className="flex min-w-max items-center gap-1.5">
              {CATS.map(item => {
                const Icon = item.icon
                const active = category === item.value && (item.label !== 'More' || category === 'all')
                return (
                  <button
                    key={item.label}
                    onClick={() => handleCatChange(item.value)}
                    className={`flex h-11 items-center gap-2 rounded-[8px] border px-4 text-[13px] font-black transition-all xl:border-0 xl:px-5 ${
                      active
                        ? 'bg-[#075CFF] text-white shadow-[0_8px_18px_rgba(7,92,255,0.26)]'
                        : 'border-[#E4E9F4] bg-white text-[#081234] shadow-[0_8px_20px_rgba(8,18,52,0.04)] hover:bg-[#F5F8FF] hover:text-[#075CFF]'
                    }`}
                  >
                    <Icon size={19} strokeWidth={2.3} />
                    {item.label}
                  </button>
                )
              })}
            </div>
          </section>

          <div className="mb-4 hidden items-center justify-between px-1 xl:flex">
            <p className="text-[14px] font-semibold text-[#44506E]">
              Live feed from <span className="font-black text-[#075CFF]">{pincode}</span> and nearby areas
              <span className="ml-3 inline-flex items-center gap-1 rounded-full bg-[#E8F8E7] px-2 py-1 text-[11px] font-black text-[#20852F]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#20B03C]" />
                Live
              </span>
            </p>
            <button className="flex items-center gap-2 text-[13px] font-semibold text-[#697391]">
              Sort by: <span className="font-black text-[#081234]">Latest</span> <ChevronDown size={15} />
            </button>
          </div>

          {posts.length === 0 && !loading ? (
            <div className="mt-8 rounded-[16px] border border-dashed border-[#D7DFF0] bg-white p-12 text-center shadow-[0_20px_44px_rgba(30,56,104,0.06)]">
              <Flame size={34} className="mx-auto text-[#075CFF]" />
              <h2 className="mt-4 text-[28px] font-black tracking-[-0.03em]">Nothing here yet.</h2>
              <p className="mx-auto mt-2 max-w-md text-[14px] font-semibold leading-relaxed text-[#697391]">
                No posts in your pincode yet. Create the first post for {pincode}. Categories ready: {nearbyLabel}.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <Link href="/create?mode=post" className="rounded-[9px] bg-[#075CFF] px-5 py-3 text-[13px] font-black text-white">Create Post</Link>
                <Link href="/create?mode=event" className="rounded-[9px] border border-[#C9D6FF] bg-white px-5 py-3 text-[13px] font-black text-[#075CFF]">Register Event</Link>
              </div>
            </div>
          ) : (
            <div className="relative pb-20">
              <div className="absolute left-0 top-4 hidden h-full w-px bg-[#C7D0E2] md:block" />
              <div className="space-y-5 xl:space-y-3">
                {posts.map(post => <FeedCard key={post.id} post={post} />)}
              </div>
              <div ref={loaderRef} className="flex justify-center py-10">
                {loading && <Loader2 size={24} className="animate-spin text-[#075CFF]" />}
                {!hasMore && posts.length > 0 && (
                  <div className="flex flex-col items-center gap-2">
                    <div className="h-1 w-1 rounded-full bg-[#8B96B2]" />
                    <p className="text-[11px] font-mono uppercase tracking-[4px] text-[#697391]">End of feed</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>

        <aside className="hidden space-y-4 xl:block">
          <Panel title="Trending in your area" icon="fire">
            {trendingPosts.length === 0 ? (
              <EmptyPanelText>No trending posts yet</EmptyPanelText>
            ) : (
              <div className="space-y-5">
                {trendingPosts.map((post, index) => (
                  <div key={post.id} className="flex gap-3">
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-[#EEF4FF] text-[14px] font-black text-[#075CFF]">{index + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-black text-[#081234]">{post.content_text || post.group?.name || 'Local update'}</p>
                      <div className="mt-1 flex items-center justify-between gap-2 text-[12px] font-semibold text-[#697391]">
                        <span>{post.group?.name ?? post.pincode}</span>
                        <span>{post.comment_count} replies</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Upcoming Events">
            {eventPosts.length === 0 ? (
              <EmptyPanelText>No events</EmptyPanelText>
            ) : (
              <div className="space-y-4">
                {eventPosts.map(event => {
                  const date = new Date(event.created_at)
                  return (
                    <div key={event.id} className="flex gap-3">
                      <div className="grid h-14 w-11 flex-shrink-0 place-items-center rounded-[8px] border border-[#E1E7F3] bg-white">
                        <div className="text-center leading-none">
                          <p className="text-[10px] font-black text-[#075CFF]">{date.toLocaleDateString('en-IN', { month: 'short' }).toUpperCase()}</p>
                          <p className="mt-1 text-[20px] font-black text-[#081234]">{date.getDate().toString().padStart(2, '0')}</p>
                        </div>
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-black">{event.content_text || event.group?.name || 'Event update'}</p>
                        <p className="mt-1 text-[12px] font-semibold text-[#697391]">{event.group?.name ?? event.pincode}</p>
                        <p className="mt-1 text-[12px] font-semibold text-[#697391]">{event.pincode}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Panel>

          <Panel title="Nearby Groups">
            {nearbyGroups.length === 0 ? (
              <EmptyPanelText>No nearby groups</EmptyPanelText>
            ) : (
              <div className="space-y-4">
                {nearbyGroups.map(group => (
                  <div key={group.id} className="flex items-center gap-3">
                    <Avatar name={group.name} src={group.cover_image_url} size={40} className="!rounded-full" />
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-black">{group.name}</p>
                      <p className="mt-1 text-[12px] font-semibold text-[#697391]">{group.pincode} <span className="mx-1">•</span> {group.member_count} members</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </aside>
      </div>
    </div>
  )
}

function Panel({ title, children, icon }: { title: string; children: React.ReactNode; icon?: 'fire' }) {
  return (
    <section className="rounded-[12px] border border-[#E1E7F3] bg-white p-5 shadow-[0_18px_48px_rgba(30,56,104,0.06)]">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-[14px] font-black text-[#081234]">
          {title} {icon === 'fire' && <span className="text-[#FF4B28]">hot</span>}
        </h2>
      </div>
      {children}
    </section>
  )
}

function EmptyPanelText({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[10px] border border-dashed border-[#D7DFF0] bg-[#F8FAFF] px-4 py-6 text-center text-[13px] font-bold text-[#697391]">
      {children}
    </div>
  )
}

function MobileTopBar({ userName, avatarUrl }: { userName: string; avatarUrl?: string | null }) {
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
