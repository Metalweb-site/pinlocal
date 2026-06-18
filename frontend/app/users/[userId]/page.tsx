'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  Bookmark,
  CalendarDays,
  ChevronDown,
  FileText,
  Grid2X2,
  Heart,
  Link as LinkIcon,
  Loader2,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Search,
  Send,
  UserPlus,
  Users,
  Zap,
} from 'lucide-react'
import Avatar from '@/components/shared/Avatar'
import NotificationBell from '@/components/shared/NotificationBell'
import { followUser, getPublicProfile, startPersonalChat, unfollowUser } from '@/lib/api'
import { Group, Post, PublicProfileUser, User } from '@/types'
import { useAuth } from '@/hooks/useAuth'
import { timeAgo } from '@/lib/utils'
import { isVideoUrl } from '@/lib/media'
import toast from 'react-hot-toast'

type PublicTab = 'Overview' | 'Posts' | 'Activity' | 'Groups' | 'Saved' | 'Connections'
type MutualUser = Pick<User, 'id' | 'username' | 'avatar_url' | 'primary_pincode'>
type PublicConnection = MutualUser & {
  is_following?: boolean
  follows_you?: boolean
  follower_count?: number
}

export default function PublicProfilePage() {
  const params = useParams<{ userId: string }>()
  const router = useRouter()
  const { user: viewer, loading: authLoading } = useAuth()
  const [profile, setProfile] = useState<PublicProfileUser | null>(null)
  const [groups, setGroups] = useState<Group[]>([])
  const [posts, setPosts] = useState<Post[]>([])
  const [mutualConnections, setMutualConnections] = useState<MutualUser[]>([])
  const [followers, setFollowers] = useState<PublicConnection[]>([])
  const [following, setFollowing] = useState<PublicConnection[]>([])
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [chatting, setChatting] = useState(false)
  const [activeTab, setActiveTab] = useState<PublicTab>('Overview')

  const loadProfile = useCallback(() => {
    setLoading(true)
    getPublicProfile(params.userId)
      .then(res => {
        setProfile(res.data.user)
        setGroups(res.data.groups ?? [])
        setPosts(res.data.posts ?? [])
        setMutualConnections(res.data.mutual_connections ?? [])
        setFollowers(res.data.followers ?? [])
        setFollowing(res.data.following ?? [])
      })
      .catch((error: any) => {
        toast.error(error?.response?.data?.message ?? 'Could not load profile')
        router.back()
      })
      .finally(() => setLoading(false))
  }, [params.userId, router])

  useEffect(() => {
    if (authLoading) return
    loadProfile()
  }, [authLoading, loadProfile])

  const toggleConnection = async () => {
    if (!profile || connecting || profile.id === viewer?.id) return
    setConnecting(true)
    try {
      if (profile.is_following) {
        await unfollowUser(profile.id)
        setProfile(prev => prev ? { ...prev, is_following: false, follower_count: Math.max(0, prev.follower_count - 1) } : prev)
        toast.success('Connection removed')
      } else {
        await followUser(profile.id)
        setProfile(prev => prev ? { ...prev, is_following: true, follower_count: prev.follower_count + 1 } : prev)
        toast.success('Connected')
      }
      window.dispatchEvent(new Event('pinlocal:badges-refresh'))
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? 'Could not update connection')
    } finally {
      setConnecting(false)
    }
  }

  const openChat = async () => {
    if (!profile || chatting || profile.id === viewer?.id) return
    setChatting(true)
    try {
      await startPersonalChat({ user_id: profile.id })
      router.push('/chats')
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? 'Could not open chat')
    } finally {
      setChatting(false)
    }
  }

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#FBFCFF]">
        <Loader2 size={28} className="animate-spin text-[#075CFF]" />
        <p className="mt-4 text-[12px] font-semibold text-[#697391]">Loading profile</p>
      </div>
    )
  }

  if (!profile) return null

  const name = profile.username ?? 'PinLocal user'
  const handle = name.toLowerCase().replace(/\s+/g, '')
  const isSelf = profile.id === viewer?.id
  const joined = new Date(profile.created_at).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
  const firstName = name.split(' ')[0] || name

  return (
    <div className="min-h-screen bg-[#FBFCFF] font-body text-[#081234]">
      <header className="sticky top-0 z-30 hidden border-b border-[#E4E9F4] bg-white/90 backdrop-blur-xl xl:block">
        <div className="mx-auto flex h-[72px] max-w-[1280px] items-center gap-8 px-8">
          <button className="flex h-10 items-center gap-3 rounded-[8px] border border-[#D7DFF0] bg-white px-3.5 text-[15px] font-black text-[#081234] shadow-[0_10px_30px_rgba(40,70,120,0.06)]">
            <MapPin size={20} className="text-[#075CFF]" strokeWidth={2.4} />
            {profile.primary_pincode}
            <ChevronDown size={16} className="text-[#697391]" />
          </button>

          <div className="mx-auto flex h-10 w-[520px] items-center rounded-[8px] border border-[#D7DFF0] bg-white px-4 shadow-[0_10px_30px_rgba(40,70,120,0.06)]">
            <Search size={20} className="mr-3 text-[#697391]" />
            <input className="min-w-0 flex-1 bg-transparent text-[14px] font-semibold text-[#081234] outline-none placeholder:text-[#8B96B2]" placeholder="Search communities, people, events..." />
            <span className="rounded-[6px] border border-[#E4E9F4] bg-[#F4F7FC] px-2 py-0.5 text-[12px] font-bold text-[#697391]">K</span>
          </div>

          <div className="flex items-center gap-6 text-[#081234]">
            <NotificationBell />
            <div className="flex items-center gap-3">
              <Avatar name={viewer?.username ?? 'You'} src={viewer?.avatar_url} size={38} className="!rounded-full" />
              <span className="text-[14px] font-black">{viewer?.username ?? 'You'}</span>
              <ChevronDown size={16} />
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1280px] grid-cols-1 gap-6 px-4 py-5 xl:grid-cols-[minmax(0,1fr)_300px] xl:px-8">
        <section className="min-w-0">
          <article className="overflow-hidden rounded-[12px] border border-[#DDE5F3] bg-white shadow-[0_18px_44px_rgba(30,56,104,0.07)]">
            <div className="relative h-[134px] bg-[radial-gradient(circle_at_78%_18%,rgba(255,184,0,0.32),transparent_23%),linear-gradient(135deg,#DCEAFF_0%,#F8FBFF_44%,#FFEFD6_100%)]">
              {profile.cover_image_url && <img src={profile.cover_image_url} alt="" className="h-full w-full object-cover" />}
              <div className="absolute inset-0 opacity-70 [background-image:linear-gradient(120deg,transparent_0%,transparent_62%,rgba(7,92,255,0.16)_62%,rgba(7,92,255,0.16)_64%,transparent_64%),linear-gradient(90deg,rgba(8,18,52,0.08)_1px,transparent_1px)] [background-size:180px_100%,48px_100%]" />
              <button className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full border border-white/70 bg-white/90 text-[#081234] shadow-lg">
                <MoreHorizontal size={18} />
              </button>
            </div>

            <div className="px-5 pb-5">
              <div className="-mt-12 flex flex-col gap-5 md:flex-row md:items-end">
                <div className="relative w-fit rounded-full border-[5px] border-white bg-white shadow-[0_16px_38px_rgba(30,56,104,0.1)]">
                  <Avatar name={name} src={profile.avatar_url} size={132} className="!rounded-full" />
                  <span className="absolute bottom-3 right-3 h-5 w-5 rounded-full border-[3px] border-white bg-[#22C55E]" />
                </div>

                <div className="min-w-0 flex-1 pb-1">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h1 className="truncate text-[28px] font-black tracking-[-0.045em] text-[#081234]">{name}</h1>
                        {profile.follows_you && <span className="rounded-full bg-[#EAF2FF] px-3 py-1 text-[11px] font-black text-[#075CFF]">Follows you</span>}
                      </div>
                      <p className="mt-1 flex flex-wrap items-center gap-2 text-[13px] font-semibold text-[#44506E]">
                        @{handle}
                        <span>•</span>
                        <MapPin size={14} className="text-[#075CFF]" />
                        {profile.primary_pincode}
                      </p>
                      <p className="mt-3 text-[13px] font-semibold leading-relaxed text-[#44506E]">
                        {profile.bio || (profile.interests?.length ? `${profile.interests.slice(0, 3).join(' • ')}` : 'Building stronger communities, one connection at a time.')}
                      </p>
                      <p className="mt-4 flex flex-wrap items-center gap-6 text-[13px] font-semibold text-[#44506E]">
                        <span className="inline-flex items-center gap-2"><CalendarDays size={15} /> Joined {joined}</span>
                        <span className="inline-flex items-center gap-2"><FileText size={15} /> Member ID: {profile.id.slice(0, 8).toUpperCase()}</span>
                      </p>
                    </div>

                    {!isSelf && (
                      <div className="flex flex-wrap gap-2">
                        <button onClick={openChat} disabled={chatting} className="inline-flex h-10 items-center gap-2 rounded-[8px] bg-[#075CFF] px-5 text-[13px] font-black text-white shadow-[0_12px_28px_rgba(7,92,255,0.18)] disabled:opacity-60">
                          {chatting ? <Loader2 size={15} className="animate-spin" /> : <MessageCircle size={15} />}
                          Message
                        </button>
                        <button onClick={toggleConnection} disabled={connecting} className={`inline-flex h-10 items-center gap-2 rounded-[8px] px-5 text-[13px] font-black disabled:opacity-60 ${profile.is_following ? 'border border-[#D7DFF0] bg-white text-[#44506E]' : 'border border-[#C9D6FF] bg-white text-[#081234]'}`}>
                          {connecting ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />}
                          {profile.is_following ? 'Following' : 'Follow'}
                        </button>
                        <button className="grid h-10 w-10 place-items-center rounded-[8px] border border-[#D7DFF0] bg-white text-[#44506E]">
                          <ChevronDown size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-5 grid border-t border-[#E4E9F4] pt-4 text-center md:grid-cols-4">
                <Stat value={profile.post_count} label="Posts" />
                <Stat value={profile.group_count} label="Groups" />
                <Stat value={profile.follower_count} label="Connections" />
                <Stat value={0} label="Events Attended" />
              </div>
            </div>
          </article>

          <nav className="mt-4 flex overflow-x-auto rounded-[9px] border border-[#DDE5F3] bg-white px-3 scrollbar-none shadow-[0_12px_30px_rgba(30,56,104,0.04)]">
            {[
              ['Overview', Grid2X2],
              ['Posts', FileText],
              ['Activity', Zap],
              ['Groups', Users],
              ['Saved', Bookmark],
              ['Connections', Users],
            ].map(([label, Icon]) => (
              <button
                key={String(label)}
                onClick={() => setActiveTab(label as PublicTab)}
                className={`flex h-12 min-w-max items-center gap-2 border-b-2 px-5 text-[13px] font-black ${activeTab === label ? 'border-[#075CFF] text-[#075CFF]' : 'border-transparent text-[#44506E]'}`}
              >
                <Icon size={16} />
                {String(label)}
              </button>
            ))}
          </nav>

          {activeTab === 'Overview' && (
            <>
              <section className="mt-4 grid gap-4 md:grid-cols-[0.95fr_1.55fr]">
                <Panel title={`About ${firstName}`}>
                  <p className="text-[13px] font-semibold leading-relaxed text-[#44506E]">
                    {profile.bio || 'No public bio added yet.'}
                  </p>
                  <p className="mt-4 flex items-center gap-2 text-[13px] font-semibold text-[#44506E]"><MapPin size={15} /> {profile.location_text || profile.primary_pincode}</p>
                  {profile.website_url && <p className="mt-3 flex items-center gap-2 text-[13px] font-semibold text-[#075CFF]"><LinkIcon size={14} /> {profile.website_url.replace(/^https?:\/\//, '')}</p>}
                </Panel>

                <Panel title="Interests">
                  <div className="flex flex-wrap gap-3">
                    {(profile.interests ?? []).length === 0 ? (
                      <p className="text-[13px] font-semibold text-[#697391]">No interests added</p>
                    ) : profile.interests.map(item => (
                      <span key={item} className="rounded-[9px] border border-[#D7DFF0] bg-[#F1F5FF] px-4 py-2 text-[13px] font-bold text-[#075CFF]">{item}</span>
                    ))}
                  </div>
                </Panel>
              </section>

              <section className="mt-6">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-[16px] font-black">Recent Posts</h2>
                  {posts.length > 0 && <button onClick={() => setActiveTab('Posts')} className="text-[12px] font-black text-[#075CFF]">View all posts</button>}
                </div>
                {posts.length === 0 ? (
                  <EmptyText>No public posts yet</EmptyText>
                ) : (
                  <div className="grid gap-4 md:grid-cols-3">
                    {posts.slice(0, 3).map(post => <MiniPostCard key={post.id} post={post} />)}
                  </div>
                )}
              </section>
            </>
          )}

          {activeTab === 'Posts' && (
            <section className="mt-6">
              <h2 className="mb-4 text-[16px] font-black">Posts</h2>
              {posts.length === 0 ? <EmptyText>No public posts yet</EmptyText> : <div className="grid gap-4 md:grid-cols-3">{posts.map(post => <MiniPostCard key={post.id} post={post} />)}</div>}
            </section>
          )}

          {activeTab === 'Groups' && (
            <section className="mt-6">
              <h2 className="mb-4 text-[16px] font-black">Communities</h2>
              {groups.length === 0 ? <EmptyText>No public groups</EmptyText> : <div className="grid gap-3 md:grid-cols-2">{groups.map(group => <GroupRow key={group.id} group={group} onOpen={() => router.push(`/groups/${group.id}`)} />)}</div>}
            </section>
          )}

          {activeTab === 'Activity' && (
            <section className="mt-6">
              <h2 className="mb-4 text-[16px] font-black">Public Activity</h2>
              {posts.length === 0 ? (
                <EmptyText>No recent public activity</EmptyText>
              ) : (
                <div className="overflow-hidden rounded-[12px] border border-[#DDE5F3] bg-white shadow-[0_18px_44px_rgba(30,56,104,0.06)]">
                  {posts.map(post => <PublicActivityRow key={post.id} post={post} />)}
                </div>
              )}
            </section>
          )}

          {activeTab === 'Connections' && (
            <section className="mt-6 space-y-4">
              <ConnectionList title="Mutual Connections" empty="No mutual connections" people={mutualConnections} onOpen={(id) => router.push(`/users/${id}`)} />
              <ConnectionList title="Followers" empty="No public followers yet" people={followers} onOpen={(id) => router.push(`/users/${id}`)} />
              <ConnectionList title="Following" empty="Not following anyone publicly yet" people={following} onOpen={(id) => router.push(`/users/${id}`)} />
            </section>
          )}

          {activeTab === 'Saved' && (
            <section className="mt-6">
              <EmptyText>Saved posts are private</EmptyText>
            </section>
          )}
        </section>

        <aside className="hidden space-y-5 xl:block">
          <Panel title="Mutual Connections" action={profile.mutual_count > 0 ? 'View all' : undefined}>
            {mutualConnections.length === 0 ? (
              <EmptySmall>No mutual connections</EmptySmall>
            ) : (
              <>
                <div className="flex -space-x-3">
                  {mutualConnections.map(person => (
                    <button key={person.id} onClick={() => router.push(`/users/${person.id}`)} className="rounded-full border-2 border-white focus:outline-none focus:ring-2 focus:ring-[#075CFF]">
                      <Avatar name={person.username ?? 'User'} src={person.avatar_url} size={40} className="!rounded-full" />
                    </button>
                  ))}
                  {profile.mutual_count > mutualConnections.length && (
                    <div className="grid h-10 w-10 place-items-center rounded-full border-2 border-white bg-[#F1F5FF] text-[12px] font-black text-[#075CFF]">
                      +{profile.mutual_count - mutualConnections.length}
                    </div>
                  )}
                </div>
                <p className="mt-4 text-[13px] font-semibold text-[#44506E]">{profile.mutual_count} mutual connections</p>
              </>
            )}
          </Panel>

          <Panel title={`Communities (${groups.length})`} action={groups.length > 0 ? 'View all' : undefined}>
            {groups.length === 0 ? <EmptySmall>No public groups</EmptySmall> : <div className="space-y-3">{groups.slice(0, 4).map(group => <GroupRow key={group.id} group={group} compact onOpen={() => router.push(`/groups/${group.id}`)} />)}</div>}
          </Panel>

          <Panel title="Recent Activity">
            {posts.length === 0 ? (
              <EmptySmall>No recent public activity</EmptySmall>
            ) : (
              <div className="space-y-4">
                {posts.slice(0, 4).map(post => (
                  <div key={post.id} className="flex gap-3 border-b border-[#EDF1F8] pb-3 last:border-b-0 last:pb-0">
                    <Avatar name={post.group?.name ?? 'Post'} src={post.group?.cover_image_url} size={34} className="!rounded-full" />
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-1 text-[12px] font-semibold text-[#44506E]">Posted in <span className="font-black text-[#081234]">{post.group?.name ?? 'a group'}</span></p>
                      <p className="mt-1 text-[11px] font-semibold text-[#697391]">{timeAgo(post.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </aside>
      </main>
    </div>
  )
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <p className="text-[16px] font-black">{value}</p>
      <p className="mt-1 text-[12px] font-semibold text-[#697391]">{label}</p>
    </div>
  )
}

function Panel({ title, action, children }: { title: string; action?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[12px] border border-[#E1E7F3] bg-white p-5 shadow-[0_18px_48px_rgba(30,56,104,0.06)]">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-[15px] font-black">{title}</h2>
        {action && <button className="text-[12px] font-black text-[#075CFF]">{action}</button>}
      </div>
      {children}
    </section>
  )
}

function MiniPostCard({ post }: { post: Post }) {
  const media = post.media_urls?.[0]
  const title = post.content_text?.trim().split(/\r?\n/)[0] || 'Community post'
  return (
    <article className="overflow-hidden rounded-[10px] border border-[#DDE5F3] bg-white shadow-[0_12px_30px_rgba(30,56,104,0.05)]">
      <div className="flex items-center gap-2 p-3">
        <Avatar name={post.author?.username ?? 'User'} src={post.author?.avatar_url} size={28} className="!rounded-full" />
        <div className="min-w-0">
          <p className="truncate text-[12px] font-black">{post.author?.username ?? 'Local user'}</p>
          <p className="text-[11px] font-semibold text-[#697391]">{timeAgo(post.created_at)} · {post.group?.name ?? 'Group'}</p>
        </div>
      </div>
      <div className="h-[132px] bg-[#F1F5FF]">
        {media ? (
          isVideoUrl(media) ? (
            <video src={media} className="h-full w-full object-cover" controls autoPlay loop muted preload="metadata" playsInline />
          ) : (
            <img src={media} alt="" className="h-full w-full object-cover" loading="lazy" />
          )
        ) : <div className="grid h-full place-items-center"><FileText size={28} className="text-[#075CFF]" /></div>}
      </div>
      <div className="p-3">
        <h3 className="line-clamp-1 text-[13px] font-black">{title}</h3>
        <p className="mt-1 line-clamp-2 text-[12px] font-semibold leading-relaxed text-[#44506E]">{post.content_text || 'No text added'}</p>
        <div className="mt-3 flex items-center justify-between text-[12px] font-bold text-[#172143]">
          <span className="inline-flex items-center gap-1"><Heart size={14} className="text-[#075CFF]" /> {post.like_count}</span>
          <span className="inline-flex items-center gap-1"><MessageCircle size={14} /> {post.comment_count}</span>
          <span className="inline-flex items-center gap-1"><Send size={14} /> {post.share_count ?? 0}</span>
        </div>
      </div>
    </article>
  )
}

function GroupRow({ group, compact = false, onOpen }: { group: Group; compact?: boolean; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className={`flex w-full items-center gap-3 rounded-[10px] text-left hover:bg-[#F7FAFF] ${compact ? 'p-1' : 'border border-[#DDE5F3] bg-white p-3'}`}>
      <Avatar name={group.name} src={group.cover_image_url} size={compact ? 38 : 46} className="!rounded-full" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-black">{group.name}</p>
        <p className="mt-1 text-[12px] font-semibold text-[#697391]">{group.member_count} members</p>
      </div>
      <MoreHorizontal size={16} className="text-[#697391]" />
    </button>
  )
}

function PublicActivityRow({ post }: { post: Post }) {
  const title = post.content_text?.trim().split(/\r?\n/)[0] || 'Community post'
  return (
    <div className="flex gap-3 border-b border-[#E4E9F4] p-4 last:border-b-0">
      <Avatar name={post.group?.name ?? 'Group'} src={post.group?.cover_image_url} size={42} className="!rounded-full" />
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-black text-[#081234]">Posted in <span className="text-[#075CFF]">{post.group?.name ?? 'a group'}</span></p>
        <p className="mt-1 line-clamp-1 text-[13px] font-semibold text-[#44506E]">{title}</p>
        <div className="mt-2 flex flex-wrap gap-4 text-[12px] font-bold text-[#697391]">
          <span>{timeAgo(post.created_at)}</span>
          <span>{post.like_count} likes</span>
          <span>{post.comment_count} comments</span>
          <span>{post.share_count ?? 0} shares</span>
        </div>
      </div>
    </div>
  )
}

function ConnectionList({ title, empty, people, onOpen }: { title: string; empty: string; people: PublicConnection[]; onOpen: (id: string) => void }) {
  return (
    <section className="overflow-hidden rounded-[12px] border border-[#DDE5F3] bg-white shadow-[0_18px_44px_rgba(30,56,104,0.06)]">
      <div className="border-b border-[#E4E9F4] px-4 py-3">
        <h3 className="text-[14px] font-black">{title}</h3>
      </div>
      {people.length === 0 ? (
        <div className="p-4"><EmptyText>{empty}</EmptyText></div>
      ) : (
        <div className="divide-y divide-[#E4E9F4]">
          {people.map(person => (
            <button key={person.id} onClick={() => onOpen(person.id)} className="flex w-full items-center gap-3 p-4 text-left hover:bg-[#F7FAFF]">
              <Avatar name={person.username ?? 'User'} src={person.avatar_url} size={44} className="!rounded-full" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-black">{person.username ?? 'PinLocal user'}</p>
                <p className="mt-1 text-[12px] font-semibold text-[#697391]">{person.primary_pincode} · {person.follower_count ?? 0} followers</p>
              </div>
              {person.follows_you && <span className="rounded-full bg-[#EAF2FF] px-2 py-1 text-[11px] font-black text-[#075CFF]">Follows you</span>}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

function EmptyText({ children }: { children: React.ReactNode }) {
  return <div className="rounded-[10px] border border-dashed border-[#D7DFF0] bg-white px-4 py-8 text-center text-[13px] font-bold text-[#697391]">{children}</div>
}

function EmptySmall({ children }: { children: React.ReactNode }) {
  return <div className="rounded-[10px] border border-dashed border-[#D7DFF0] bg-[#FBFCFF] px-3 py-6 text-center text-[12px] font-bold text-[#697391]">{children}</div>
}
