'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getMyGroups,
  getNotificationSettings,
  getNotifications,
  getPersonalChats,
  markAllNotificationsRead,
  markNotificationsRead,
  updateChatNotificationPreference,
  updateGroupNotificationPreference,
  updateNotificationSettings,
} from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { useAuthStore } from '@/store/auth.store'
import { Notification } from '@/types'
import Avatar from '@/components/shared/Avatar'
import NotificationBell from '@/components/shared/NotificationBell'
import {
  AtSign,
  Bell,
  ChevronDown,
  Clock3,
  Heart,
  Loader2,
  Mail,
  MapPin,
  Megaphone,
  MessageCircle,
  MoreHorizontal,
  Search,
  Settings,
  Shield,
  UserPlus,
} from 'lucide-react'
import { timeAgo } from '@/lib/utils'
import toast from 'react-hot-toast'

const ICON_MAP: Record<string, { icon: any; bg: string; color: string; title: string; subtitle?: string }> = {
  join_approved: { icon: UserPlus, bg: '#E8F8EF', color: '#42B873', title: 'Group update' },
  join_request: { icon: UserPlus, bg: '#E8F8EF', color: '#42B873', title: 'Group request' },
  reply: { icon: MessageCircle, bg: '#EAF2FF', color: '#1677FF', title: 'New message' },
  mention: { icon: AtSign, bg: '#EAF2FF', color: '#1677FF', title: 'Mention' },
  post_milestone: { icon: Megaphone, bg: '#FFE7EF', color: '#FF3D75', title: 'Announcement' },
  like: { icon: Heart, bg: '#FFF2D8', color: '#FFA62B', title: 'Post activity' },
  system: { icon: Shield, bg: '#EEF2FA', color: '#667085', title: 'Security alert' },
}

const FILTERS = ['All', 'Unread', 'Mentions', 'Groups', 'Events', 'System']
const PAGE_SIZE = 10

type NotificationCounts = {
  total: number
  unread: number
  byType: Record<string, number>
}

type NotificationSettingsState = {
  push_enabled: boolean
  email_enabled: boolean
  group_updates_enabled: boolean
  chat_messages_enabled: boolean
  activity_enabled: boolean
  quiet_hours_enabled: boolean
  quiet_hours_start: string
  quiet_hours_end: string
}

type MuteGroup = { id: string; name: string; cover_image_url?: string | null; pincode: string; preference?: 'all' | 'muted' }
type MuteChat = { id: string; other_user?: { username?: string | null; phone?: string; avatar_url?: string | null; primary_pincode?: string } ; preference?: 'all' | 'muted' }

export default function AlertsPage() {
  const { user } = useAuthStore()
  const { loading: authLoading } = useAuth()
  const [notifs, setNotifs] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [filter, setFilter] = useState('All')
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [counts, setCounts] = useState<NotificationCounts>({ total: 0, unread: 0, byType: {} })
  const [settings, setSettings] = useState<NotificationSettingsState | null>(null)
  const [groups, setGroups] = useState<MuteGroup[]>([])
  const [chats, setChats] = useState<MuteChat[]>([])

  const markVisibleRead = useCallback(async (items: Notification[]) => {
    const unreadIds = items.filter(n => !n.is_read).map(n => n.id)
    if (unreadIds.length === 0) return
    setCounts(prev => ({ ...prev, unread: Math.max(0, prev.unread - unreadIds.length) }))
    try {
      await markNotificationsRead(unreadIds)
      window.dispatchEvent(new Event('pinlocal:badges-refresh'))
    } catch {}
  }, [])

  useEffect(() => {
    if (!authLoading) {
      Promise.all([
        getNotifications(1, PAGE_SIZE),
        getNotificationSettings(),
        getMyGroups().catch(() => ({ data: { groups: [] } })),
        getPersonalChats().catch(() => ({ data: { conversations: [] } })),
      ])
        .then(([r, settingsRes, groupsRes, chatsRes]) => {
          const items = r.data.notifications ?? []
          setNotifs(items.map((n: Notification) => ({ ...n, is_read: true })))
          setPage(r.data.page ?? 1)
          setHasMore(Boolean(r.data.hasMore))
          setCounts(r.data.counts ?? { total: items.length, unread: items.filter((n: Notification) => !n.is_read).length, byType: {} })
          const savedSettings = settingsRes.data.settings
          setSettings({
            ...savedSettings,
            quiet_hours_start: String(savedSettings?.quiet_hours_start ?? '22:00').slice(0, 5),
            quiet_hours_end: String(savedSettings?.quiet_hours_end ?? '07:00').slice(0, 5),
          })
          const groupPrefs = new Map((settingsRes.data.group_prefs ?? []).map((pref: any) => [pref.group_id, pref.preference]))
          setGroups((groupsRes.data.groups ?? []).map((group: any) => ({ ...group, preference: groupPrefs.get(group.id) ?? 'all' })))
          const chatPrefs = new Map((settingsRes.data.chat_prefs ?? []).map((pref: any) => [pref.conversation_id, pref.preference]))
          setChats((chatsRes.data.conversations ?? []).map((chat: any) => ({ ...chat, preference: chatPrefs.get(chat.id) ?? 'all' })))
          void markVisibleRead(items)
        })
        .catch(() => {})
        .finally(() => setLoading(false))
    }
  }, [authLoading, markVisibleRead])

  const markAllRead = async () => {
    try {
      await markAllNotificationsRead()
      setNotifs(p => p.map(n => ({ ...n, is_read: true })))
      setCounts(prev => ({ ...prev, unread: 0 }))
      window.dispatchEvent(new Event('pinlocal:badges-refresh'))
    } catch {}
  }

  const saveSetting = async (patch: Partial<NotificationSettingsState>) => {
    if (!settings) return
    const previous = settings
    const next = { ...settings, ...patch }
    setSettings(next)
    try {
      const res = await updateNotificationSettings(patch)
      setSettings({
        ...res.data.settings,
        quiet_hours_start: String(res.data.settings.quiet_hours_start ?? next.quiet_hours_start).slice(0, 5),
        quiet_hours_end: String(res.data.settings.quiet_hours_end ?? next.quiet_hours_end).slice(0, 5),
      })
      window.dispatchEvent(new Event('pinlocal:badges-refresh'))
    } catch (error: any) {
      setSettings(previous)
      toast.error(error?.response?.data?.message ?? 'Could not update notification settings')
    }
  }

  const toggleGroupMute = async (group: MuteGroup) => {
    const previous = groups
    const preference = group.preference === 'muted' ? 'all' : 'muted'
    setGroups(prev => prev.map(item => item.id === group.id ? { ...item, preference } : item))
    try {
      await updateGroupNotificationPreference(group.id, preference)
      window.dispatchEvent(new Event('pinlocal:badges-refresh'))
    } catch (error: any) {
      setGroups(previous)
      toast.error(error?.response?.data?.message ?? 'Could not update group mute')
    }
  }

  const toggleChatMute = async (chat: MuteChat) => {
    const previous = chats
    const preference = chat.preference === 'muted' ? 'all' : 'muted'
    setChats(prev => prev.map(item => item.id === chat.id ? { ...item, preference } : item))
    try {
      await updateChatNotificationPreference(chat.id, preference)
      window.dispatchEvent(new Event('pinlocal:badges-refresh'))
    } catch (error: any) {
      setChats(previous)
      toast.error(error?.response?.data?.message ?? 'Could not update chat mute')
    }
  }

  const loadMore = async () => {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    try {
      const nextPage = page + 1
      const res = await getNotifications(nextPage, PAGE_SIZE)
      const items = res.data.notifications ?? []
      setNotifs(prev => {
        const seen = new Set(prev.map(n => n.id))
        return [...prev, ...items.filter((n: Notification) => !seen.has(n.id)).map((n: Notification) => ({ ...n, is_read: true }))]
      })
      setPage(res.data.page ?? nextPage)
      setHasMore(Boolean(res.data.hasMore))
      setCounts(res.data.counts ?? counts)
      void markVisibleRead(items)
    } finally {
      setLoadingMore(false)
    }
  }

  const unreadCount = counts.unread
  const filtered = useMemo(() => {
    if (filter === 'Unread') return notifs.filter(n => !n.is_read)
    if (filter === 'Mentions') return notifs.filter(n => n.type === 'mention')
    if (filter === 'Groups') return notifs.filter(n => n.type.includes('join'))
    if (filter === 'Events') return notifs.filter(n => n.type.includes('event'))
    if (filter === 'System') return notifs.filter(n => n.type === 'system')
    return notifs
  }, [filter, notifs])

  const pincode = user?.primary_pincode ?? '400001'
  const userName = user?.username ?? 'Sujal'

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#FBFCFF]">
        <Loader2 size={28} className="animate-spin text-[#075CFF]" />
        <p className="mt-4 text-[12px] font-semibold text-[#697391]">Loading notifications</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#FBFCFF] font-body text-[#081234]">
      <div className="hidden xl:block">
        <header className="sticky top-0 z-30 border-b border-[#E4E9F4] bg-white/90 backdrop-blur-xl">
          <div className="mx-auto flex h-[76px] max-w-[1220px] items-center gap-8 px-9">
            <button className="flex h-10 items-center gap-3 rounded-[8px] border border-[#D7DFF0] bg-white px-3.5 text-[15px] font-black text-[#081234] shadow-[0_10px_30px_rgba(40,70,120,0.06)]">
              <MapPin size={20} className="text-[#075CFF]" strokeWidth={2.4} />
              {pincode}
              <ChevronDown size={16} className="text-[#697391]" />
            </button>

            <div className="mx-auto flex h-10 w-[520px] items-center rounded-[8px] border border-[#D7DFF0] bg-white px-4 shadow-[0_10px_30px_rgba(40,70,120,0.06)]">
              <Search size={20} className="mr-3 text-[#697391]" />
              <input
                className="min-w-0 flex-1 bg-transparent text-[14px] font-semibold text-[#081234] outline-none placeholder:text-[#8B96B2]"
                placeholder="Search communities, people, events..."
              />
              <span className="rounded-[6px] border border-[#E4E9F4] px-2 py-0.5 text-[12px] font-bold text-[#697391]">K</span>
            </div>

            <MessageCircle size={20} className="text-[#081234]" />
            <NotificationBell />
            <div className="flex items-center gap-3">
              <Avatar name={userName} src={user?.avatar_url} size={38} className="!rounded-full" />
              <span className="text-[14px] font-black">{userName}</span>
              <ChevronDown size={16} />
            </div>
          </div>
        </header>
      </div>

      <div className="mx-auto grid max-w-[1220px] grid-cols-1 gap-8 px-4 pt-7 xl:grid-cols-[minmax(0,1fr)_300px] xl:px-9">
        <main className="min-w-0">
          <section className="mb-7 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-[34px] font-black leading-none tracking-[-0.045em]">Notifications</h1>
              <p className="mt-3 text-[15px] font-semibold text-[#44506E]">Stay updated with what&apos;s happening in your community</p>
            </div>
            <div className="flex items-center gap-4">
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="text-[13px] font-black text-[#075CFF]">
                  Mark all as read
                </button>
              )}
              <button className="grid h-9 w-9 place-items-center rounded-[8px] border border-[#D7DFF0] bg-white text-[#081234]">
                <MoreHorizontal size={18} />
              </button>
            </div>
          </section>

          <section className="mb-6 flex gap-3 overflow-x-auto scrollbar-none">
            {FILTERS.map(item => (
              <button
                key={item}
                onClick={() => setFilter(item)}
                className={`flex h-10 min-w-max items-center gap-2 rounded-[9px] border px-5 text-[13px] font-bold ${
                  filter === item
                    ? 'border-[#9CB9FF] bg-[#F1F5FF] text-[#075CFF]'
                    : 'border-[#E1E7F3] bg-white text-[#44506E]'
                }`}
              >
                {item}
                {item === 'Unread' && unreadCount > 0 && (
                  <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#075CFF] px-1.5 text-[11px] text-white">{unreadCount}</span>
                )}
              </button>
            ))}
          </section>

          <section className="overflow-hidden rounded-[12px] border border-[#DDE5F3] bg-white shadow-[0_18px_44px_rgba(30,56,104,0.07)]">
            {filtered.length === 0 ? (
              <div className="p-12 text-center">
                <Bell size={30} className="mx-auto text-[#8B96B2]" />
                <h2 className="mt-4 text-[20px] font-black">No notifications</h2>
                <p className="mx-auto mt-2 max-w-sm text-[14px] font-semibold leading-relaxed text-[#697391]">
                  Real notifications will appear here when there are updates.
                </p>
              </div>
            ) : (
              <>
                {filtered.map(n => <NotificationRow key={n.id} notification={n} />)}
                {hasMore && (
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="flex h-16 w-full items-center justify-center gap-2 border-t border-[#E4E9F4] text-[13px] font-black text-[#44506E] disabled:opacity-60"
                  >
                    {loadingMore ? <Loader2 size={16} className="animate-spin text-[#075CFF]" /> : <ChevronDown size={16} />}
                    {loadingMore ? 'Loading more' : 'Load more'}
                  </button>
                )}
              </>
            )}
          </section>
        </main>

        <aside className="hidden space-y-5 xl:block">
          <Panel title="Notification Preferences" icon={<Settings size={17} className="text-[#697391]" />}>
            <Preference icon={Bell} label="Push Notifications" checked={Boolean(settings?.push_enabled)} onChange={value => saveSetting({ push_enabled: value })} />
            <Preference icon={Mail} label="Email Notifications" checked={Boolean(settings?.email_enabled)} onChange={value => saveSetting({ email_enabled: value })} />
            <Preference icon={MessageCircle} label="Group Updates" checked={Boolean(settings?.group_updates_enabled)} onChange={value => saveSetting({ group_updates_enabled: value })} />
            <Preference icon={AtSign} label="Personal Chats" checked={Boolean(settings?.chat_messages_enabled)} onChange={value => saveSetting({ chat_messages_enabled: value })} />
            <Preference icon={Heart} label="Post Activity" checked={Boolean(settings?.activity_enabled)} onChange={value => saveSetting({ activity_enabled: value })} />
          </Panel>

          <Panel title="Quick Filters">
            <Quick label="All Notifications" value={counts.total} active />
            <Quick label="Unread" value={unreadCount} />
            <Quick label="Mentions" value={counts.byType.mention ?? 0} />
            <Quick label="Group Updates" value={(counts.byType.join_approved ?? 0) + (counts.byType.join_request ?? 0)} />
            <Quick label="Event Updates" value={Object.entries(counts.byType).filter(([type]) => type.includes('event')).reduce((sum, [, value]) => sum + value, 0)} />
            <Quick label="System" value={(counts.byType.system ?? 0) + (counts.byType.account_sanction ?? 0) + (counts.byType.report_update ?? 0)} />
          </Panel>

          <Panel title="Quiet Hours">
            <p className="text-[13px] font-semibold leading-relaxed text-[#44506E]">
              You won&apos;t receive push notifications during these hours.
            </p>
            <label className="mt-4 flex items-center justify-between text-[13px] font-black">
              Enable quiet hours
              <input type="checkbox" checked={Boolean(settings?.quiet_hours_enabled)} onChange={event => saveSetting({ quiet_hours_enabled: event.target.checked })} />
            </label>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <input type="time" value={settings?.quiet_hours_start ?? '22:00'} onChange={event => saveSetting({ quiet_hours_start: event.target.value })} className="h-10 rounded-[8px] border border-[#D7DFF0] px-2 text-[13px] font-bold" />
              <input type="time" value={settings?.quiet_hours_end ?? '07:00'} onChange={event => saveSetting({ quiet_hours_end: event.target.value })} className="h-10 rounded-[8px] border border-[#D7DFF0] px-2 text-[13px] font-bold" />
            </div>
          </Panel>

          <Panel title="Muted Groups">
            {groups.length === 0 ? <MiniEmpty>No groups yet</MiniEmpty> : groups.slice(0, 6).map(group => (
              <MuteRow key={group.id} name={group.name} meta={group.pincode} muted={group.preference === 'muted'} onToggle={() => toggleGroupMute(group)} />
            ))}
          </Panel>

          <Panel title="Muted Personal Chats">
            {chats.length === 0 ? <MiniEmpty>No chats yet</MiniEmpty> : chats.slice(0, 6).map(chat => (
              <MuteRow key={chat.id} name={chat.other_user?.username ?? chat.other_user?.phone ?? 'User'} meta={chat.other_user?.primary_pincode ?? 'Personal chat'} muted={chat.preference === 'muted'} onToggle={() => toggleChatMute(chat)} />
            ))}
          </Panel>
        </aside>
      </div>
    </div>
  )
}

function NotificationRow({ notification }: { notification: Notification }) {
  const config = ICON_MAP[notification.type] || { icon: Bell, bg: '#EEF2FA', color: '#667085', title: notification.type.replace(/_/g, ' ') }
  const Icon = config.icon
  const message = notification.message || fallbackMessage(notification.type)
  const title = config.title
  const subtitle = notification.reference_type ? notification.reference_type.replace(/_/g, ' ') : ''

  return (
    <div className={`relative flex min-h-[88px] items-center gap-4 border-b border-[#E4E9F4] px-5 py-4 last:border-b-0 ${notification.is_read ? 'bg-white' : 'bg-[#F7FAFF]'}`}>
      <div className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-full" style={{ background: config.bg, color: config.color }}>
        <Icon size={23} strokeWidth={2.4} />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-[14px] font-black">{title}</h3>
        <p className="mt-1 line-clamp-1 text-[14px] font-semibold text-[#172143]">{message}</p>
        {subtitle && <p className="mt-1 text-[13px] font-semibold text-[#697391]">{subtitle}</p>}
      </div>
      <div className="flex flex-col items-end gap-4">
        <span className="text-[12px] font-semibold text-[#697391]">{timeAgo(notification.created_at)}</span>
        {!notification.is_read && <span className="h-2.5 w-2.5 rounded-full bg-[#075CFF]" />}
      </div>
    </div>
  )
}

function Panel({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-[12px] border border-[#E1E7F3] bg-white p-5 shadow-[0_18px_48px_rgba(30,56,104,0.06)]">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-[15px] font-black">{title}</h2>
        {icon}
      </div>
      {children}
    </section>
  )
}

function Preference({ icon: Icon, label, checked, onChange }: { icon: any; label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex h-12 w-full cursor-pointer items-center gap-3 text-left text-[13px] font-bold text-[#172143]">
      <Icon size={18} className="text-[#697391]" />
      <span className="min-w-0 flex-1">{label}</span>
      <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} />
    </label>
  )
}

function MuteRow({ name, meta, muted, onToggle }: { name: string; meta?: string; muted: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center gap-3 border-b border-[#EDF1F8] py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-black">{name}</p>
        {meta && <p className="mt-0.5 truncate text-[11px] font-semibold text-[#697391]">{meta}</p>}
      </div>
      <button
        type="button"
        onClick={onToggle}
        className={`rounded-[7px] px-3 py-2 text-[11px] font-black ${muted ? 'bg-[#FFF1F1] text-red-600' : 'bg-[#EAF2FF] text-[#075CFF]'}`}
      >
        {muted ? 'Muted' : 'Mute'}
      </button>
    </div>
  )
}

function MiniEmpty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-[8px] border border-dashed border-[#D7DFF0] p-4 text-center text-[12px] font-bold text-[#697391]">{children}</div>
}

function Quick({ label, value, active = false }: { label: string; value: number; active?: boolean }) {
  return (
    <button className={`flex h-10 w-full items-center justify-between rounded-[8px] px-3 text-[13px] font-bold ${active ? 'bg-[#F1F5FF] text-[#075CFF]' : 'text-[#172143]'}`}>
      {label}
      <span className="grid h-6 min-w-6 place-items-center rounded-full bg-[#EDF3FF] px-2 text-[12px] text-[#44506E]">{value}</span>
    </button>
  )
}

function fallbackMessage(type: string) {
  if (type === 'like') return 'Someone liked your post'
  if (type === 'mention') return 'Someone mentioned you'
  if (type === 'reply') return 'New reply in your group'
  return 'New update available in your community'
}
