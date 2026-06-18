'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, Building2, CalendarDays, ChevronDown, Filter, HandHeart, Loader2, MapPin, Search, Store, Users } from 'lucide-react'
import Avatar from '@/components/shared/Avatar'
import NotificationBell from '@/components/shared/NotificationBell'
import PincodeSwitcher from '@/components/shared/PincodeSwitcher'
import { getFeed, getMyGroups, searchUsers } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { useAuthStore } from '@/store/auth.store'
import { Group, Post, User } from '@/types'
import { timeAgo } from '@/lib/utils'

type SearchUser = Pick<User, 'id' | 'phone' | 'username' | 'avatar_url' | 'primary_pincode'>

const QUICK = [
  { label: 'People', icon: Users, tone: 'text-[#075CFF] bg-[#F3F7FF]' },
  { label: 'Groups', icon: Users, tone: 'text-[#16A34A] bg-[#F4FBF6]' },
  { label: 'Events', icon: CalendarDays, tone: 'text-[#7C3AED] bg-[#F8F5FF]' },
  { label: 'Marketplace', icon: Store, tone: 'text-[#F97316] bg-[#FFF7F1]' },
  { label: 'Help', icon: HandHeart, tone: 'text-[#EC4899] bg-[#FFF5FA]' },
  { label: 'Businesses', icon: Building2, tone: 'text-[#0891B2] bg-[#F0FBFF]' },
]

export default function SearchPage() {
  const { user, loading: authLoading } = useAuth()
  const { activePincode } = useAuthStore()
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [people, setPeople] = useState<SearchUser[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (authLoading) return
    Promise.all([
      getMyGroups().catch(() => ({ data: { groups: [] } })),
      getFeed(1, 'Events').catch(() => ({ data: { posts: [] } })),
    ])
      .then(([groupsRes, feedRes]) => {
        setGroups(groupsRes.data.groups ?? [])
        setPosts(feedRes.data.posts ?? [])
      })
      .finally(() => setLoading(false))
  }, [activePincode, authLoading])

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setPeople([])
      return
    }
    const timer = window.setTimeout(() => {
      searchUsers(q)
        .then(res => setPeople(res.data.users ?? []))
        .catch(() => setPeople([]))
    }, 250)
    return () => window.clearTimeout(timer)
  }, [query])

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return groups.slice(0, 3)
    return groups.filter(group =>
      group.name.toLowerCase().includes(q) ||
      group.category.toLowerCase().includes(q) ||
      group.pincode.includes(q)
    ).slice(0, 4)
  }, [groups, query])

  const eventPosts = useMemo(() => posts.slice(0, 3), [posts])
  const pincode = activePincode || user?.primary_pincode || '400001'
  const userName = user?.username ?? 'Resident'

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#FBFCFF]">
        <Loader2 size={28} className="animate-spin text-[#075CFF]" />
        <p className="mt-4 text-[12px] font-semibold text-[#697391]">Loading search</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#FBFCFF] px-5 pb-28 pt-7 font-body text-[#081234] xl:px-9">
      <header className="mb-7 flex items-center justify-between xl:hidden">
        <PincodeSwitcher variant="mobile-topbar" />
        <div className="flex items-center gap-4">
          <NotificationBell />
          <Link href="/profile" aria-label="Open profile">
            <Avatar name={userName} src={user?.avatar_url} size={40} className="!rounded-full" />
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[900px]">
        <h1 className="text-[30px] font-black tracking-[-0.045em] xl:text-[38px]">Search</h1>

        <section className="mt-5 flex gap-3">
          <div className="flex h-12 min-w-0 flex-1 items-center rounded-[9px] border border-[#D7DFF0] bg-white px-4 shadow-[0_10px_30px_rgba(40,70,120,0.04)]">
            <Search size={20} className="mr-3 text-[#697391]" />
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              className="min-w-0 flex-1 bg-transparent text-[14px] font-semibold text-[#081234] outline-none placeholder:text-[#8B96B2]"
              placeholder="Search people, posts, groups, events and more..."
            />
          </div>
          <button className="grid h-12 w-12 place-items-center rounded-[9px] border border-[#D7DFF0] bg-white text-[#081234] shadow-[0_10px_30px_rgba(40,70,120,0.04)]">
            <Filter size={19} />
          </button>
        </section>

        <h2 className="mt-7 text-[16px] font-black">Quick Categories</h2>
        <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-6">
          {QUICK.map(item => {
            const Icon = item.icon
            return (
              <button key={item.label} className={`rounded-[12px] p-3 text-center shadow-[0_8px_20px_rgba(8,18,52,0.04)] ${item.tone}`}>
                <Icon size={25} className="mx-auto" />
                <span className="mt-2 block text-[11px] font-black text-[#081234]">{item.label}</span>
              </button>
            )
          })}
        </div>

        <ResultSection title="People" action="See all">
          {(people.length === 0 && query.trim().length >= 2) ? (
            <EmptyText>No people found</EmptyText>
          ) : (people.length > 0 ? people : []).slice(0, 4).map(person => (
            <button key={person.id} onClick={() => router.push(person.id === user?.id ? '/profile' : `/users/${person.id}`)} className="flex w-full items-center gap-3 border-b border-[#EDF1F8] p-3 text-left last:border-b-0">
              <Avatar name={person.username ?? person.phone} src={person.avatar_url} size={44} className="!rounded-full" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-black">{person.username ?? person.phone}</p>
                <p className="mt-1 text-[12px] font-semibold text-[#697391]">{person.primary_pincode}</p>
              </div>
              <span className="rounded-[8px] border border-[#D7DFF0] px-3 py-2 text-[12px] font-black text-[#075CFF]">View Profile</span>
            </button>
          ))}
          {people.length === 0 && query.trim().length < 2 && <EmptyText>Type at least 2 letters to search people</EmptyText>}
        </ResultSection>

        <ResultSection title="Groups" action="See all">
          {filteredGroups.length === 0 ? <EmptyText>No groups found</EmptyText> : filteredGroups.map(group => (
            <button key={group.id} onClick={() => router.push(group.default_thread_id ? `/groups/${group.id}/threads/${group.default_thread_id}` : `/groups/${group.id}`)} className="flex w-full items-center gap-3 border-b border-[#EDF1F8] p-3 text-left last:border-b-0">
              <Avatar name={group.name} src={group.cover_image_url} size={48} className="!rounded-[9px]" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-black">{group.name}</p>
                <p className="mt-1 text-[12px] font-semibold text-[#697391]">{group.type} group - {group.member_count} members</p>
                <p className="mt-1 text-[12px] font-semibold text-[#697391]">{group.pincode}</p>
              </div>
              <span className="rounded-[8px] border border-[#D7DFF0] px-3 py-2 text-[12px] font-black text-[#075CFF]">View Group</span>
            </button>
          ))}
        </ResultSection>

        <ResultSection title="Events" action="See all">
          {eventPosts.length === 0 ? <EmptyText>No events</EmptyText> : eventPosts.map(post => (
            <button key={post.id} onClick={() => router.push('/feed')} className="flex w-full items-center gap-3 border-b border-[#EDF1F8] p-3 text-left last:border-b-0">
              <div className="h-[58px] w-[76px] overflow-hidden rounded-[8px] bg-[#F1F5FF]">
                {post.media_urls?.[0] ? <img src={post.media_urls[0]} alt="" className="h-full w-full object-cover" /> : <CalendarDays size={26} className="m-4 text-[#075CFF]" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-1 text-[13px] font-black">{post.content_text?.split('\n')[0] ?? 'Local event'}</p>
                <p className="mt-1 text-[12px] font-semibold text-[#697391]">{post.group?.name ?? post.pincode}</p>
                <p className="mt-1 text-[12px] font-semibold text-[#697391]">{timeAgo(post.created_at)}</p>
              </div>
              <span className="rounded-[8px] border border-[#D7DFF0] px-3 py-2 text-[12px] font-black text-[#075CFF]">View Details</span>
            </button>
          ))}
        </ResultSection>

        <div className="mt-5 flex items-center gap-4 rounded-[12px] bg-[#F3F7FF] p-5">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-[#EAF2FF] text-[#075CFF]">
            <Search size={23} />
          </div>
          <div>
            <h2 className="text-[14px] font-black">Can&apos;t find what you&apos;re looking for?</h2>
            <p className="mt-1 text-[12px] font-semibold text-[#697391]">Try different keywords or explore categories.</p>
          </div>
        </div>
      </main>
    </div>
  )
}

function ResultSection({ title, action, children }: { title: string; action: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[16px] font-black">{title}</h2>
        <button className="text-[12px] font-black text-[#075CFF]">{action}</button>
      </div>
      <div className="overflow-hidden rounded-[12px] border border-[#E1E7F3] bg-white shadow-[0_10px_24px_rgba(30,56,104,0.04)]">
        {children}
      </div>
    </section>
  )
}

function EmptyText({ children }: { children: React.ReactNode }) {
  return <p className="p-5 text-center text-[13px] font-semibold text-[#697391]">{children}</p>
}
