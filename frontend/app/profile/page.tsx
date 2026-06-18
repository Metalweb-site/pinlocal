'use client'

import { ChangeEvent, useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Bookmark, CalendarDays, Camera, CheckCircle2, ChevronDown, ChevronRight, ExternalLink, Globe, Heart, ImageIcon, Loader2, LogOut, MapPin, MessageCircle, Pencil, Save, Search, Settings, ShieldCheck, UserPlus, UserRound, Users, X, Zap } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useAuthStore } from '@/store/auth.store'
import { followUser, getConnections, getMyGroups, getMyPosts, getProfileStats, getSavedPosts, getUserActivity, logout as apiLogout, searchUsers, setPasscode as apiSetPasscode, unfollowUser, updateMe, uploadMedia } from '@/lib/api'
import { IMAGE_FILE_ACCEPT, validateMediaFile } from '@/lib/media'
import Avatar from '@/components/shared/Avatar'
import NotificationBell from '@/components/shared/NotificationBell'
import PincodeSwitcher from '@/components/shared/PincodeSwitcher'
import FeedCard from '@/components/feed/FeedCard'
import { CATEGORIES, ConnectionUser, Group, Post, UserActivity } from '@/types'
import toast from 'react-hot-toast'

type ProfileTab = 'Overview' | 'Posts' | 'Activity' | 'Groups' | 'Saved' | 'Connections' | 'Settings'

type ProfileStats = {
  posts: number
  groups: number
  following: number
  followers: number
  events_attended: number
}

function normalizeLocalityValue(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '').trim()
}

export default function ProfilePage() {
  const { user, loading: authLoading } = useAuth()
  const { setUser, logout, activePincode } = useAuthStore()
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [username, setUsername] = useState('')
  const [pincode, setPincode] = useState('')
  const [bio, setBio] = useState('')
  const [locationText, setLocationText] = useState('')
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [coverImageUrl, setCoverImageUrl] = useState('')
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [coverUploading, setCoverUploading] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement | null>(null)
  const coverInputRef = useRef<HTMLInputElement | null>(null)
  const [interests, setInterests] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<ProfileTab>('Overview')
  const [savedPosts, setSavedPosts] = useState<Post[]>([])
  const [myPosts, setMyPosts] = useState<Post[]>([])
  const [myGroups, setMyGroups] = useState<Group[]>([])
  const [activities, setActivities] = useState<UserActivity[]>([])
  const [savedLoading, setSavedLoading] = useState(false)
  const [postsLoading, setPostsLoading] = useState(false)
  const [groupsLoading, setGroupsLoading] = useState(false)
  const [activityLoading, setActivityLoading] = useState(false)
  const [savedLoaded, setSavedLoaded] = useState(false)
  const [postsLoaded, setPostsLoaded] = useState(false)
  const [groupsLoaded, setGroupsLoaded] = useState(false)
  const [activityLoaded, setActivityLoaded] = useState(false)
  const [stats, setStats] = useState<ProfileStats>({ posts: 0, groups: 0, following: 0, followers: 0, events_attended: 0 })
  const [following, setFollowing] = useState<ConnectionUser[]>([])
  const [followers, setFollowers] = useState<ConnectionUser[]>([])
  const [suggestions, setSuggestions] = useState<ConnectionUser[]>([])
  const [connectionSearch, setConnectionSearch] = useState('')
  const [connectionResults, setConnectionResults] = useState<ConnectionUser[]>([])
  const [connectionsLoading, setConnectionsLoading] = useState(false)
  const [connectionsLoaded, setConnectionsLoaded] = useState(false)
  const [connectionBusyId, setConnectionBusyId] = useState<string | null>(null)
  const [passcodeModalOpen, setPasscodeModalOpen] = useState(false)
  const [passcodeDraft, setPasscodeDraft] = useState('')
  const [passcodeConfirm, setPasscodeConfirm] = useState('')
  const [passcodeSaving, setPasscodeSaving] = useState(false)

  useEffect(() => {
    setUsername(user?.username ?? '')
    setPincode(user?.primary_pincode ?? '')
    setBio(user?.bio ?? '')
    setLocationText(user?.location_text ?? user?.locality_name ?? user?.city ?? '')
    setWebsiteUrl(user?.website_url ?? '')
    setAvatarUrl(user?.avatar_url ?? '')
    setCoverImageUrl(user?.cover_image_url ?? '')
    setInterests(user?.interests ?? [])
  }, [user])

  const refreshStats = useCallback(() => {
    getProfileStats()
      .then(res => setStats(res.data.stats ?? { posts: 0, groups: 0, following: 0, followers: 0, events_attended: 0 }))
      .catch(() => undefined)
  }, [])

  const refreshConnections = () => {
    setConnectionsLoading(true)
    getConnections()
      .then(res => {
        setFollowing(res.data.following ?? [])
        setFollowers(res.data.followers ?? [])
        setSuggestions(res.data.suggestions ?? [])
        setConnectionsLoaded(true)
      })
      .catch((error: any) => toast.error(error?.response?.data?.message ?? 'Could not load connections'))
      .finally(() => setConnectionsLoading(false))
  }

  useEffect(() => {
    if (authLoading || !user) return
    refreshStats()
  }, [authLoading, refreshStats, user])

  const loadPosts = useCallback(() => {
    setPostsLoading(true)
    getMyPosts()
      .then(res => {
        setMyPosts(res.data.posts ?? [])
        setPostsLoaded(true)
      })
      .catch((error: any) => toast.error(error?.response?.data?.message ?? 'Could not load posts'))
      .finally(() => setPostsLoading(false))
  }, [])

  const loadGroups = useCallback(() => {
    setGroupsLoading(true)
    getMyGroups()
      .then(res => {
        setMyGroups(res.data.groups ?? [])
        setGroupsLoaded(true)
      })
      .catch((error: any) => toast.error(error?.response?.data?.message ?? 'Could not load groups'))
      .finally(() => setGroupsLoading(false))
  }, [])

  const handleSave = async () => {
    const cleanUsername = username.trim()
    const cleanBio = bio.trim()
    const cleanLocation = locationText.trim()
    const cleanWebsite = websiteUrl.trim()
    if (cleanUsername.length < 3) return toast.error('Name must be at least 3 characters')
    if (cleanBio.length < 12) return toast.error('Add a short bio so neighbours know you')
    if (cleanLocation.length < 2) return toast.error('Add your local area')
    if (interests.length === 0) return toast.error('Pick at least one interest')
    setLoading(true)
    try {
      const previousLocality = user?.locality_name ?? user?.location_text ?? ''
      const localityEdited = normalizeLocalityValue(cleanLocation) !== normalizeLocalityValue(previousLocality)
      const res = await updateMe({
        username: cleanUsername,
        primary_pincode: pincode,
        interests,
        bio: cleanBio,
        location_text: cleanLocation,
        locality_name: cleanLocation,
        locality_confirmed: true,
        locality_user_edited: localityEdited,
        location_source: localityEdited ? 'manual' : (user?.location_source ?? 'manual'),
        website_url: cleanWebsite || null,
        avatar_url: avatarUrl || undefined,
        cover_image_url: coverImageUrl || null,
      })
      setUser(res.data.user)
      setEditing(false)
      toast.success('Profile updated')
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Update failed')
    } finally {
      setLoading(false)
    }
  }

  const handleProfileImage = async (event: ChangeEvent<HTMLInputElement>, type: 'avatar' | 'cover') => {
    const file = event.target.files?.[0]
    if (!file) return
    const validationError = validateMediaFile(file, { imageOnly: true })
    if (validationError) {
      toast.error(validationError)
      event.target.value = ''
      return
    }

    type === 'avatar' ? setAvatarUploading(true) : setCoverUploading(true)
    try {
      const res = await uploadMedia(file)
      if (type === 'avatar') setAvatarUrl(res.data.url)
      else setCoverImageUrl(res.data.url)
      toast.success(type === 'avatar' ? 'Profile photo uploaded' : 'Cover photo uploaded')
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? 'Upload failed')
    } finally {
      type === 'avatar' ? setAvatarUploading(false) : setCoverUploading(false)
      event.target.value = ''
    }
  }

  const handleLogout = async () => {
    try {
      await apiLogout()
      logout()
      router.push('/auth/login')
    } catch {
      logout()
      router.push('/auth/login')
    }
  }

  const savePasscode = async () => {
    if (!/^[0-9]{4,8}$/.test(passcodeDraft)) {
      toast.error('Passcode must be 4 to 8 digits')
      return
    }
    if (passcodeDraft !== passcodeConfirm) {
      toast.error('Passcodes do not match')
      return
    }

    setPasscodeSaving(true)
    try {
      const res = await apiSetPasscode(passcodeDraft)
      setUser(res.data.user)
      setPasscodeModalOpen(false)
      setPasscodeDraft('')
      setPasscodeConfirm('')
      toast.success(user?.has_passcode ? 'Passcode reset' : 'Passcode set')
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? 'Could not save passcode')
    } finally {
      setPasscodeSaving(false)
    }
  }

  const toggleInterest = (cat: string) => {
    setInterests(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat])
  }

  useEffect(() => {
    if (authLoading || activeTab !== 'Saved' || savedLoaded || savedLoading) return
    setSavedLoading(true)
    getSavedPosts()
      .then(res => {
        setSavedPosts(res.data.posts ?? [])
        setSavedLoaded(true)
      })
      .catch((error: any) => toast.error(error?.response?.data?.message ?? 'Could not load saved posts'))
      .finally(() => setSavedLoading(false))
  }, [activeTab, authLoading, savedLoaded, savedLoading])

  useEffect(() => {
    if (authLoading || postsLoaded || postsLoading) return
    if (activeTab !== 'Overview' && activeTab !== 'Posts') return
    loadPosts()
  }, [activeTab, authLoading, loadPosts, postsLoaded, postsLoading])

  useEffect(() => {
    if (authLoading || groupsLoaded || groupsLoading) return
    if (activeTab !== 'Groups') return
    loadGroups()
  }, [activeTab, authLoading, groupsLoaded, groupsLoading, loadGroups])

  useEffect(() => {
    if (authLoading || activeTab !== 'Activity' || activityLoaded || activityLoading) return
    setActivityLoading(true)
    getUserActivity()
      .then(res => {
        setActivities(res.data.activities ?? [])
        setActivityLoaded(true)
      })
      .catch((error: any) => toast.error(error?.response?.data?.message ?? 'Could not load activity'))
      .finally(() => setActivityLoading(false))
  }, [activeTab, authLoading, activityLoaded, activityLoading])

  useEffect(() => {
    if (authLoading || activeTab !== 'Connections' || connectionsLoaded || connectionsLoading) return
    refreshConnections()
  }, [activeTab, authLoading, connectionsLoaded, connectionsLoading])

  useEffect(() => {
    if (activeTab !== 'Connections') return
    const q = connectionSearch.trim()
    if (q.length < 2) {
      setConnectionResults([])
      return
    }

    const handle = window.setTimeout(() => {
      searchUsers(q)
        .then(res => setConnectionResults(res.data.users ?? []))
        .catch(() => setConnectionResults([]))
    }, 250)

    return () => window.clearTimeout(handle)
  }, [activeTab, connectionSearch])

  const handleConnectionToggle = async (target: ConnectionUser) => {
    setConnectionBusyId(target.id)
    try {
      if (target.is_following) {
        await unfollowUser(target.id)
        toast.success('Connection removed')
      } else {
        await followUser(target.id)
        toast.success('Connected')
      }
      await Promise.all([
        getConnections().then(res => {
          setFollowing(res.data.following ?? [])
          setFollowers(res.data.followers ?? [])
          setSuggestions(res.data.suggestions ?? [])
          setConnectionsLoaded(true)
        }),
        getProfileStats().then(res => setStats(res.data.stats ?? stats)),
      ])
      if (connectionSearch.trim().length >= 2) {
        const res = await searchUsers(connectionSearch.trim())
        setConnectionResults(res.data.users ?? [])
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Could not update connection')
    } finally {
      setConnectionBusyId(null)
    }
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#FBFCFF]">
        <Loader2 size={28} className="animate-spin text-[#075CFF]" />
        <p className="mt-4 text-[12px] font-semibold text-[#697391]">Loading profile</p>
      </div>
    )
  }

  const userName = user?.username ?? 'Resident'
  const pincodeValue = activePincode || user?.primary_pincode || '400001'
  const joined = user?.created_at ? new Date(user.created_at).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) : 'Not available'
  const checks = [
    ['Profile picture', Boolean(user?.avatar_url)],
    ['Cover photo', Boolean(user?.cover_image_url)],
    ['Name', Boolean(user?.username)],
    ['Bio', Boolean(user?.bio)],
    ['Local area', Boolean(user?.location_text)],
    ['Pincode', Boolean(user?.primary_pincode)],
    ['Add interests', (user?.interests?.length ?? 0) > 0],
    ['Add connections', stats.following > 0 || stats.followers > 0],
  ] as const
  const completedChecks = checks.filter(([, done]) => done).length
  const profileStrength = Math.round((checks.filter(([, done]) => done).length / checks.length) * 100)
  const handleValue = `@${userName.toLowerCase().replace(/\s+/g, '_')}`
  const memberIdLabel = user?.id?.slice(0, 8).toUpperCase() ?? 'N/A'
  const locationLabel = user?.location_text?.trim() || pincodeValue

  return (
    <div className="min-h-screen bg-[#FBFCFF] font-body text-[#081234]">
      <div className="hidden xl:block">
        <header className="sticky top-0 z-30 border-b border-[#E4E9F4] bg-white/90 backdrop-blur-xl">
          <div className="mx-auto flex h-[76px] max-w-[1220px] items-center gap-8 px-9">
            <PincodeSwitcher variant="desktop-header" />
            <div className="mx-auto flex h-10 w-[520px] items-center rounded-[8px] border border-[#D7DFF0] bg-white px-4 shadow-[0_10px_30px_rgba(40,70,120,0.06)]">
              <Search size={20} className="mr-3 text-[#697391]" />
              <input className="min-w-0 flex-1 bg-transparent text-[14px] font-semibold text-[#081234] outline-none placeholder:text-[#8B96B2]" placeholder="Search communities, people, events..." />
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

      <div className="px-4 pb-4 pt-5 xl:hidden">
        <header className="mb-4 flex items-center justify-between">
          <PincodeSwitcher variant="mobile-topbar" />
          <div className="flex items-center gap-4">
            <NotificationBell />
            <Link href="/profile" aria-label="Open profile">
              <Avatar name={userName} src={user?.avatar_url} size={42} className="!rounded-full" />
            </Link>
          </div>
        </header>

        <input ref={avatarInputRef} type="file" accept={IMAGE_FILE_ACCEPT} className="hidden" onChange={(event) => handleProfileImage(event, 'avatar')} />
        <input ref={coverInputRef} type="file" accept={IMAGE_FILE_ACCEPT} className="hidden" onChange={(event) => handleProfileImage(event, 'cover')} />

        <section className="overflow-hidden rounded-[22px] border border-[#DDE5F3] bg-white shadow-[0_18px_44px_rgba(30,56,104,0.08)]">
          <div className="relative h-[170px] overflow-hidden bg-[linear-gradient(180deg,#EAF2FF_0%,#F7FAFF_100%)]">
            {(coverImageUrl || user?.cover_image_url) ? (
              <>
                <img
                  src={coverImageUrl || user?.cover_image_url || ''}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.08)_0%,rgba(255,255,255,0.18)_45%,rgba(255,255,255,0.42)_100%)]" />
                <div className="absolute inset-x-0 bottom-0 h-[70px] bg-[linear-gradient(180deg,rgba(255,255,255,0)_0%,rgba(255,255,255,0.78)_100%)]" />
              </>
            ) : (
              <MobileSkylineBackdrop />
            )}
            {editing && (
              <button type="button" onClick={() => coverInputRef.current?.click()} className="absolute right-4 top-4 inline-flex h-10 items-center gap-2 rounded-[12px] border border-white/70 bg-white/92 px-4 text-[13px] font-black text-[#075CFF] shadow-[0_12px_30px_rgba(30,56,104,0.14)]">
                {coverUploading ? <Loader2 size={15} className="animate-spin" /> : <ImageIcon size={15} />}
                Cover
              </button>
            )}
          </div>

          <div className="relative px-4 pb-5">
            <div className="absolute left-4 top-[-52px] z-10">
              <div className="relative">
                <div className="rounded-full border-[5px] border-white bg-white shadow-[0_18px_42px_rgba(30,56,104,0.16)]">
                  <Avatar name={userName} src={avatarUrl || user?.avatar_url} size={118} className="!rounded-full" />
                </div>
                <span className="absolute bottom-3 right-3 h-6 w-6 rounded-full border-[3px] border-white bg-[#22C55E]" />
                {editing && (
                  <button type="button" onClick={() => avatarInputRef.current?.click()} className="absolute bottom-2 left-2 grid h-10 w-10 place-items-center rounded-full bg-[#075CFF] text-white shadow-[0_12px_28px_rgba(7,92,255,0.28)]">
                    {avatarUploading ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
                  </button>
                )}
              </div>
            </div>

            <div className="min-h-[128px] pl-[136px] pt-4">
              <div className="min-w-0">
                <h1 className="text-[24px] font-black leading-[1.05] tracking-[-0.04em] text-[#081234] [overflow-wrap:anywhere]">{userName}</h1>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-[12px] font-semibold text-[#44506E]">
                  {handleValue}
                  <span>&bull;</span>
                  <MapPin size={13} className="text-[#075CFF]" />
                  {pincodeValue}
                </p>
                <button onClick={() => setEditing(true)} className="mt-3 inline-flex h-11 items-center gap-2 rounded-[14px] border border-[#C9D6FF] bg-[#F7FAFF] px-4 text-[13px] font-black text-[#075CFF] shadow-[0_10px_24px_rgba(7,92,255,0.08)]">
                  Edit Profile
                  <Pencil size={15} />
                </button>
              </div>
            </div>

            <div className="mt-3">
              <p className="text-[16px] font-semibold leading-relaxed text-[#081234]">{user?.bio || 'Add a short bio so neighbours know you.'}</p>
              <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3 text-[13px] font-semibold text-[#273560]">
                <span className="inline-flex items-center gap-2"><CalendarDays size={15} /> Joined {joined}</span>
                <span className="inline-flex items-center gap-2"><MapPin size={15} /> {locationLabel}</span>
                <span className="inline-flex items-center gap-2"><UserRound size={15} /> Member ID: {memberIdLabel}</span>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-4 overflow-hidden rounded-[18px] border border-[#E4E9F4] bg-white">
              <MobileStat value={String(stats.posts)} label="Posts" />
              <MobileStat value={String(stats.groups)} label="Groups" />
              <MobileStat value={String(stats.following)} label="Connections" />
              <MobileStat value={String(stats.events_attended)} label="Events Attended" />
            </div>
          </div>
        </section>

        <section className="mt-4 flex overflow-x-auto rounded-[18px] border border-[#DDE5F3] bg-white px-2 shadow-[0_12px_30px_rgba(30,56,104,0.05)] scrollbar-none">
          {[
            ['Overview', UserRound],
            ['Posts', Bookmark],
            ['Saved', Bookmark],
          ].map(([label, Icon]) => (
            <button
              key={String(label)}
              onClick={() => setActiveTab(label as ProfileTab)}
              className={`flex h-14 min-w-[92px] flex-1 items-center justify-center gap-2 border-b-[3px] px-3 text-[14px] font-black ${activeTab === label ? 'border-[#075CFF] text-[#075CFF]' : 'border-transparent text-[#44506E]'}`}
            >
              <Icon size={18} />
              {String(label)}
            </button>
          ))}
        </section>

        <div className="mt-4 space-y-4">
          {activeTab === 'Overview' && (
            <>
              <section className="rounded-[20px] border border-[#DDE5F3] bg-white p-5 shadow-[0_18px_44px_rgba(30,56,104,0.06)]">
                <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-4">
                  <div
                    className="grid h-[96px] w-[96px] flex-shrink-0 place-items-center rounded-full"
                    style={{ background: `conic-gradient(#075CFF ${profileStrength * 3.6}deg, #E7EEFF 0deg)` }}
                  >
                    <div
                      className="grid h-[74px] w-[74px] place-items-center rounded-full bg-white text-[18px] font-black text-[#081234]"
                    >
                      {profileStrength}%
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <h2 className="min-w-0 flex-1 text-[16px] font-black text-[#081234]">Great progress!</h2>
                      <div className="shrink-0 rounded-[12px] bg-[#EEF3FF] px-3 py-2 text-center text-[11px] font-black leading-none text-[#075CFF]">
                        {completedChecks} / {checks.length} completed
                      </div>
                    </div>
                    <p className="mt-2 text-[13px] font-semibold leading-relaxed text-[#44506E]">
                      Complete a few more steps to build trust within your neighbourhood.
                    </p>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-8 gap-1.5">
                  {checks.map(([item, done]) => (
                    <span key={item} className={`h-2 rounded-full ${done ? 'bg-[#075CFF]' : 'bg-[#DDE5F3]'}`} />
                  ))}
                </div>

                <div className="mt-5 grid grid-cols-2 gap-x-8 gap-y-3">
                  {checks.map(([item, done]) => (
                    <div key={item} className="flex items-center gap-3 text-[13px] font-semibold text-[#273560]">
                      {done ? <CheckCircle2 size={18} className="text-[#16A34A]" /> : <span className="h-[18px] w-[18px] rounded-full border-2 border-[#667085]" />}
                      {item}
                    </div>
                  ))}
                </div>
              </section>

              <MobileInfoCard title="About Me" icon={<UserRound size={24} className="text-[#075CFF]" />} onClick={() => setEditing(true)}>
                <p className="text-[14px] font-semibold leading-relaxed text-[#081234]">{user?.bio || 'No bio added yet.'}</p>
                <p className="mt-3 flex items-center gap-2 text-[13px] font-semibold text-[#44506E]"><MapPin size={14} /> {locationLabel}</p>
              </MobileInfoCard>

              <MobileInfoCard title="Interests" icon={<Heart size={24} className="text-[#8B5CF6]" />} onClick={() => setEditing(true)}>
                <div className="flex flex-wrap gap-2">
                  {(user?.interests?.length ?? 0) > 0 ? (
                    (user?.interests ?? []).map(item => (
                      <span key={item} className="rounded-full border border-[#D7DFF0] bg-[#F7FAFF] px-4 py-2 text-[13px] font-black text-[#075CFF]">{item}</span>
                    ))
                  ) : (
                    <p className="text-[13px] font-semibold text-[#697391]">No interests added yet.</p>
                  )}
                </div>
              </MobileInfoCard>

              <div className="grid grid-cols-2 gap-3">
                <MobileMiniCard title="Top Communities" icon={<Users size={24} className="text-[#16A34A]" />} onClick={() => setActiveTab('Groups')}>
                  {myGroups.length > 0 ? `${myGroups.length} joined communities` : 'No communities yet'}
                </MobileMiniCard>
                <MobileMiniCard title="Upcoming Events" icon={<CalendarDays size={24} className="text-[#F97316]" />} onClick={() => setActiveTab('Posts')}>
                  No upcoming events
                </MobileMiniCard>
              </div>

              <div className="space-y-3">
                <MobileActionRow title="Connections" icon={<UserPlus size={20} className="text-[#075CFF]" />} onClick={() => setActiveTab('Connections')}>
                  View followers, following, and nearby people.
                </MobileActionRow>
                <MobileActionRow title="Activity" icon={<Zap size={20} className="text-[#075CFF]" />} onClick={() => setActiveTab('Activity')}>
                  See your latest likes and comments.
                </MobileActionRow>
                <MobileActionRow title="More Settings" icon={<Settings size={20} className="text-[#075CFF]" />} onClick={() => setActiveTab('Settings')}>
                  Manage pincode, passcode, and account options.
                </MobileActionRow>
              </div>
            </>
          )}

          {activeTab === 'Posts' && (
            postsLoading ? <LoadingState label="Loading posts" /> : myPosts.length === 0 ? <EmptyPanelText>No posts yet</EmptyPanelText> : <div className="space-y-4">{myPosts.map(post => <FeedCard key={post.id} post={post} />)}</div>
          )}

          {activeTab === 'Saved' && (
            savedLoading ? <LoadingState label="Loading saved posts" /> : savedPosts.length === 0 ? <EmptyPanelText>No saved posts yet</EmptyPanelText> : <div className="space-y-4">{savedPosts.map(post => <FeedCard key={post.id} post={post} />)}</div>
          )}

          {activeTab === 'Activity' && (
            activityLoading ? <LoadingState label="Loading activity" /> : activities.length === 0 ? <EmptyPanelText>No likes or comments yet</EmptyPanelText> : <div className="overflow-hidden rounded-[18px] border border-[#DDE5F3] bg-white shadow-[0_18px_44px_rgba(30,56,104,0.07)]">{activities.map(activity => <ActivityRow key={activity.id} activity={activity} />)}</div>
          )}

          {activeTab === 'Groups' && (
            groupsLoading ? <LoadingState label="Loading groups" /> : myGroups.length === 0 ? <EmptyPanelText>No groups joined yet</EmptyPanelText> : <div className="grid gap-3">{myGroups.map(group => <ProfileGroupCard key={group.id} group={group} onOpen={() => group.default_thread_id ? router.push(`/groups/${group.id}/threads/${group.default_thread_id}`) : router.push(`/groups/${group.id}`)} />)}</div>
          )}

          {activeTab === 'Connections' && (
            connectionsLoading ? (
              <LoadingState label="Loading connections" />
            ) : (
              <div className="space-y-4">
                <div className="rounded-[18px] border border-[#DDE5F3] bg-white p-4 shadow-[0_18px_44px_rgba(30,56,104,0.06)]">
                  <div className="flex h-11 items-center rounded-[12px] border border-[#D7DFF0] bg-[#FBFCFF] px-3">
                    <Search size={17} className="mr-2 text-[#697391]" />
                    <input
                      value={connectionSearch}
                      onChange={e => setConnectionSearch(e.target.value)}
                      placeholder="Search people by name, phone, or pincode"
                      className="min-w-0 flex-1 bg-transparent text-[13px] font-semibold text-[#081234] outline-none placeholder:text-[#8B96B2]"
                    />
                  </div>
                </div>
                {connectionSearch.trim().length >= 2 && (
                  <ConnectionSection title="Search Results" empty="No users found">
                    {connectionResults.map(person => <ConnectionRow key={person.id} person={person} busy={connectionBusyId === person.id} onToggle={handleConnectionToggle} />)}
                  </ConnectionSection>
                )}
                <ConnectionSection title="Following" empty="You are not following anyone yet">
                  {following.map(person => <ConnectionRow key={person.id} person={person} busy={connectionBusyId === person.id} onToggle={handleConnectionToggle} />)}
                </ConnectionSection>
                <ConnectionSection title="Followers" empty="No followers yet">
                  {followers.map(person => <ConnectionRow key={person.id} person={person} busy={connectionBusyId === person.id} onToggle={handleConnectionToggle} />)}
                </ConnectionSection>
              </div>
            )
          )}

          {activeTab === 'Settings' && (
            <section className="overflow-hidden rounded-[18px] border border-[#DDE5F3] bg-white shadow-[0_18px_44px_rgba(30,56,104,0.06)]">
              <div className="border-b border-[#E4E9F4] p-5">
                <h2 className="text-[20px] font-black tracking-[-0.03em]">Settings</h2>
                <p className="mt-1 text-[13px] font-semibold text-[#697391]">Manage location, security, and account access.</p>
              </div>

              <div className="border-b border-[#E4E9F4] p-5">
                <h3 className="text-[15px] font-black">Location</h3>
                <p className="mt-1 text-[13px] font-semibold text-[#697391]">Your pincode helps us show relevant local content.</p>
                <div className="mt-4 grid gap-4">
                  <div>
                    <label className="text-[12px] font-black text-[#44506E]">Primary Pincode</label>
                    <div className="mt-2 flex gap-2">
                      <div className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-[8px] border border-[#D7DFF0] bg-[#FBFCFF] px-3 text-[14px] font-black text-[#081234]">
                        <MapPin size={17} className="text-[#075CFF]" />
                        {pincodeValue}
                      </div>
                      <button onClick={() => setEditing(true)} className="h-11 rounded-[8px] border border-[#D7DFF0] bg-white px-4 text-[13px] font-black text-[#075CFF]">Change</button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-5">
                <h3 className="text-[15px] font-black">Account Management</h3>
                <div className="mt-4 divide-y divide-[#E4E9F4]">
                  <SettingsActionRow
                    title={user?.has_passcode ? 'Reset Passcode' : 'Set Passcode'}
                    description={user?.has_passcode ? 'Change the passcode requested after OTP verification.' : 'Add an extra lock after OTP verification.'}
                    button={user?.has_passcode ? 'Reset Passcode' : 'Set Passcode'}
                    icon={<ShieldCheck size={17} />}
                    onClick={() => setPasscodeModalOpen(true)}
                  />
                  <SettingsActionRow
                    title="Deactivate Account"
                    description="Temporarily deactivate your account and hide your profile."
                    button="Deactivate"
                    onClick={() => toast('Deactivate account is not enabled yet')}
                  />
                  <SettingsActionRow
                    danger
                    title="Delete Account"
                    description="Permanently delete your account and all your data."
                    button="Delete Account"
                    onClick={() => toast('Delete account is not enabled yet')}
                  />
                </div>
              </div>
            </section>
          )}
        </div>
      </div>

      <div className="hidden xl:grid mx-auto max-w-[1220px] grid-cols-1 gap-8 px-4 pt-5 xl:grid-cols-[minmax(0,1fr)_300px] xl:px-9">
        <input ref={avatarInputRef} type="file" accept={IMAGE_FILE_ACCEPT} className="hidden" onChange={(event) => handleProfileImage(event, 'avatar')} />
        <input ref={coverInputRef} type="file" accept={IMAGE_FILE_ACCEPT} className="hidden" onChange={(event) => handleProfileImage(event, 'cover')} />
        <main className="min-w-0">
          <section className="overflow-hidden rounded-[12px] border border-[#DDE5F3] bg-white shadow-[0_18px_44px_rgba(30,56,104,0.07)]">
            <div className="relative h-[166px] bg-[radial-gradient(circle_at_20%_20%,rgba(7,92,255,0.28),transparent_32%),linear-gradient(135deg,#EAF2FF,#F8FBFF)]">
              {(coverImageUrl || user?.cover_image_url) && <img src={coverImageUrl || user?.cover_image_url || ''} alt="" className="h-full w-full object-cover" />}
              {editing && (
                <button type="button" onClick={() => coverInputRef.current?.click()} className="absolute right-4 top-4 inline-flex h-10 items-center gap-2 rounded-[8px] border border-white/70 bg-white/90 px-4 text-[12px] font-black text-[#075CFF] shadow-[0_12px_30px_rgba(30,56,104,0.14)]">
                  {coverUploading ? <Loader2 size={15} className="animate-spin" /> : <ImageIcon size={15} />}
                  Cover
                </button>
              )}
            </div>
            <div className="px-5 pb-5">
              <div className="-mt-16 flex flex-col gap-5 md:flex-row md:items-start">
                <div className="relative w-fit">
                  <div className="rounded-full border-[5px] border-white bg-white shadow-[0_18px_42px_rgba(30,56,104,0.18)]">
                    <Avatar name={userName} src={avatarUrl || user?.avatar_url} size={132} className="!rounded-full" />
                  </div>
                  <span className="absolute bottom-4 right-3 h-5 w-5 rounded-full border-[3px] border-white bg-[#22C55E]" />
                  {editing && (
                    <button type="button" onClick={() => avatarInputRef.current?.click()} className="absolute bottom-3 left-3 grid h-10 w-10 place-items-center rounded-full bg-[#075CFF] text-white shadow-[0_12px_28px_rgba(7,92,255,0.28)]">
                      {avatarUploading ? <Loader2 size={17} className="animate-spin" /> : <Camera size={17} />}
                    </button>
                  )}
                </div>
                <div className="min-w-0 flex-1 pt-16 md:pt-[86px]">
                  {editing ? (
                    <EditPanel username={username} pincode={pincode} bio={bio} locationText={locationText} websiteUrl={websiteUrl} interests={interests} setUsername={setUsername} setPincode={setPincode} setBio={setBio} setLocationText={setLocationText} setWebsiteUrl={setWebsiteUrl} toggleInterest={toggleInterest} />
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center gap-3">
                        <h1 className="text-[27px] font-black tracking-[-0.04em] text-[#081234]">{userName}</h1>
                        <button onClick={() => setEditing(true)} className="ml-auto hidden rounded-[8px] border border-[#C9D6FF] bg-[#F7FAFF] px-4 py-2 text-[13px] font-black text-[#075CFF] md:inline-flex">Edit Profile</button>
                      </div>
                      <p className="mt-1 flex flex-wrap items-center gap-2 text-[13px] font-semibold text-[#44506E]">
                        @{userName.toLowerCase().replace(/\s+/g, '')}
                        <span>&bull;</span>
                        <MapPin size={14} className="text-[#075CFF]" />
                        {pincodeValue}
                      </p>
                      <p className="mt-3 max-w-2xl text-[13px] font-semibold leading-relaxed text-[#44506E]">{user?.bio || 'No bio added yet.'}</p>
                      <p className="mt-4 flex flex-wrap items-center gap-6 text-[13px] font-semibold text-[#44506E]">
                        <span className="inline-flex items-center gap-2"><CalendarDays size={15} /> Joined {joined}</span>
                        {user?.location_text && <span className="inline-flex items-center gap-2"><MapPin size={15} /> {user.location_text}</span>}
                        {user?.website_url && <a href={user.website_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-[#075CFF]"><Globe size={15} /> Website</a>}
                        <span className="inline-flex items-center gap-2"><UserRound size={15} /> Member ID: {user?.id?.slice(0, 8).toUpperCase() ?? 'N/A'}</span>
                      </p>
                    </>
                  )}
                </div>
              </div>

              <div className="mt-5 grid border-t border-[#E4E9F4] pt-4 text-center md:grid-cols-4">
                <Stat value={String(stats.posts)} label="Posts" />
                <Stat value={String(stats.groups)} label="Groups" />
                <Stat value={String(stats.following)} label="Connections" />
                <Stat value={String(stats.events_attended)} label="Events Attended" />
              </div>
            </div>
          </section>

          <section className="mt-4 flex overflow-x-auto rounded-[9px] border border-[#DDE5F3] bg-white px-3 scrollbar-none shadow-[0_12px_30px_rgba(30,56,104,0.04)]">
            {[
              ['Overview', UserRound],
              ['Posts', Bookmark],
              ['Activity', Zap],
              ['Groups', Users],
              ['Saved', Bookmark],
              ['Connections', Users],
              ['Settings', Settings],
            ].map(([label, Icon]) => (
              <button
                key={String(label)}
                onClick={() => setActiveTab(label as ProfileTab)}
                className={`flex h-12 min-w-max items-center gap-2 border-b-2 px-5 text-[13px] font-black ${activeTab === label ? 'border-[#075CFF] text-[#075CFF]' : 'border-transparent text-[#44506E]'}`}
              >
                <Icon size={16} />
                {String(label)}
              </button>
            ))}
          </section>

          {activeTab === 'Overview' && (
            <>
              <section className="mt-4 grid gap-4 md:grid-cols-[0.95fr_1.55fr]">
                <div className="rounded-[10px] border border-[#DDE5F3] bg-white p-4 shadow-[0_12px_30px_rgba(30,56,104,0.04)]">
                  <h2 className="text-[15px] font-black">About Me</h2>
                  <p className="mt-3 text-[13px] font-semibold leading-relaxed text-[#44506E]">{user?.bio || 'No bio added yet.'}</p>
                  <p className="mt-4 flex items-center gap-2 text-[13px] font-semibold text-[#44506E]"><MapPin size={15} /> {user?.location_text || pincodeValue}</p>
                  <p className="mt-3 flex items-center gap-2 text-[13px] font-semibold text-[#075CFF]"><ExternalLink size={14} /> {user?.website_url ? user.website_url.replace(/^https?:\/\//, '') : `pinlocal.in/u/${userName.toLowerCase()}`}</p>
                </div>
                <div className="rounded-[10px] border border-[#DDE5F3] bg-white p-4 shadow-[0_12px_30px_rgba(30,56,104,0.04)]">
                  <h2 className="text-[15px] font-black">Interests</h2>
                  <div className="mt-4 flex flex-wrap gap-3">
                    {(user?.interests ?? []).map(item => (
                      <span key={item} className="rounded-[9px] border border-[#D7DFF0] bg-[#F1F5FF] px-4 py-2 text-[13px] font-bold text-[#075CFF]">{item}</span>
                    ))}
                    {(user?.interests?.length ?? 0) === 0 && <p className="text-[13px] font-semibold text-[#697391]">No interests added yet.</p>}
                  </div>
                </div>
              </section>

              <section className="mt-6">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-[16px] font-black">Recent Posts</h2>
                  {myPosts.length > 0 && <button onClick={() => setActiveTab('Posts')} className="text-[12px] font-black text-[#075CFF]">View all posts</button>}
                </div>
                {postsLoading ? (
                  <LoadingState label="Loading recent posts" />
                ) : myPosts.length === 0 ? (
                  <EmptyPanelText>No recent posts</EmptyPanelText>
                ) : (
                  <div className="space-y-5">
                    {myPosts.slice(0, 3).map(post => <FeedCard key={post.id} post={post} />)}
                  </div>
                )}
              </section>
            </>
          )}

          {activeTab === 'Posts' && (
            <section className="mt-6">
              <h2 className="mb-4 text-[16px] font-black">Your Posts</h2>
              {postsLoading ? (
                <LoadingState label="Loading posts" />
              ) : myPosts.length === 0 ? (
                <EmptyPanelText>No posts yet</EmptyPanelText>
              ) : (
                <div className="space-y-5">
                  {myPosts.map(post => <FeedCard key={post.id} post={post} />)}
                </div>
              )}
            </section>
          )}

          {activeTab === 'Groups' && (
            <section className="mt-6">
              <h2 className="mb-4 text-[16px] font-black">Your Groups</h2>
              {groupsLoading ? (
                <LoadingState label="Loading groups" />
              ) : myGroups.length === 0 ? (
                <EmptyPanelText>No groups joined yet</EmptyPanelText>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {myGroups.map(group => <ProfileGroupCard key={group.id} group={group} onOpen={() => group.default_thread_id ? router.push(`/groups/${group.id}/threads/${group.default_thread_id}`) : router.push(`/groups/${group.id}`)} />)}
                </div>
              )}
            </section>
          )}

          {activeTab === 'Saved' && (
            <section className="mt-6">
              <h2 className="mb-4 text-[16px] font-black">Saved Posts</h2>
              {savedLoading ? (
                <LoadingState label="Loading saved posts" />
              ) : savedPosts.length === 0 ? (
                <EmptyPanelText>No saved posts yet</EmptyPanelText>
              ) : (
                <div className="space-y-5">
                  {savedPosts.map(post => <FeedCard key={post.id} post={post} />)}
                </div>
              )}
            </section>
          )}

          {activeTab === 'Activity' && (
            <section className="mt-6">
              <h2 className="mb-4 text-[16px] font-black">Your Activity</h2>
              {activityLoading ? (
                <LoadingState label="Loading activity" />
              ) : activities.length === 0 ? (
                <EmptyPanelText>No likes or comments yet</EmptyPanelText>
              ) : (
                <div className="overflow-hidden rounded-[12px] border border-[#DDE5F3] bg-white shadow-[0_18px_44px_rgba(30,56,104,0.07)]">
                  {activities.map(activity => <ActivityRow key={activity.id} activity={activity} />)}
                </div>
              )}
            </section>
          )}

          {activeTab === 'Connections' && (
            <section className="mt-6 space-y-4">
              <div className="flex flex-col gap-3 rounded-[12px] border border-[#DDE5F3] bg-white p-4 shadow-[0_18px_44px_rgba(30,56,104,0.06)] md:flex-row md:items-center">
                <div>
                  <h2 className="text-[16px] font-black">Connections</h2>
                  <p className="mt-1 text-[13px] font-semibold text-[#697391]">{stats.following} following · {stats.followers} followers</p>
                </div>
                <div className="flex h-11 min-w-0 flex-1 items-center rounded-[9px] border border-[#D7DFF0] bg-[#FBFCFF] px-3 md:ml-auto md:max-w-[380px]">
                  <Search size={17} className="mr-2 text-[#697391]" />
                  <input
                    value={connectionSearch}
                    onChange={e => setConnectionSearch(e.target.value)}
                    placeholder="Search people by name, phone, or pincode"
                    className="min-w-0 flex-1 bg-transparent text-[13px] font-semibold text-[#081234] outline-none placeholder:text-[#8B96B2]"
                  />
                </div>
              </div>

              {connectionsLoading ? (
                <LoadingState label="Loading connections" />
              ) : (
                <>
                  {connectionSearch.trim().length >= 2 && (
                    <ConnectionSection title="Search Results" empty="No users found">
                      {connectionResults.map(person => (
                        <ConnectionRow key={person.id} person={person} busy={connectionBusyId === person.id} onToggle={handleConnectionToggle} />
                      ))}
                    </ConnectionSection>
                  )}

                  <ConnectionSection title="Following" empty="You are not following anyone yet">
                    {following.map(person => (
                      <ConnectionRow key={person.id} person={person} busy={connectionBusyId === person.id} onToggle={handleConnectionToggle} />
                    ))}
                  </ConnectionSection>

                  <ConnectionSection title="Followers" empty="No followers yet">
                    {followers.map(person => (
                      <ConnectionRow key={person.id} person={person} busy={connectionBusyId === person.id} onToggle={handleConnectionToggle} />
                    ))}
                  </ConnectionSection>

                  <ConnectionSection title="Suggested Nearby" empty="No nearby suggestions right now">
                    {suggestions.map(person => (
                      <ConnectionRow key={person.id} person={person} busy={connectionBusyId === person.id} onToggle={handleConnectionToggle} />
                    ))}
                  </ConnectionSection>
                </>
              )}
            </section>
          )}

          {activeTab === 'Settings' && (
            <section className="mt-6">
              <div className="overflow-hidden rounded-[12px] border border-[#DDE5F3] bg-white shadow-[0_18px_44px_rgba(30,56,104,0.06)]">
                <div className="border-b border-[#E4E9F4] p-5">
                  <h2 className="text-[20px] font-black tracking-[-0.03em]">Settings</h2>
                  <p className="mt-1 text-[13px] font-semibold text-[#697391]">Manage location, security, and account access.</p>
                </div>

                <div className="border-b border-[#E4E9F4] p-5">
                  <h3 className="text-[15px] font-black">Location</h3>
                  <p className="mt-1 text-[13px] font-semibold text-[#697391]">Your pincode helps us show relevant local content.</p>
                  <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <div>
                      <label className="text-[12px] font-black text-[#44506E]">Primary Pincode</label>
                      <div className="mt-2 flex gap-2">
                        <div className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-[8px] border border-[#D7DFF0] bg-[#FBFCFF] px-3 text-[14px] font-black text-[#081234]">
                          <MapPin size={17} className="text-[#075CFF]" />
                          {pincodeValue}
                        </div>
                        <button onClick={() => setEditing(true)} className="h-11 rounded-[8px] border border-[#D7DFF0] bg-white px-4 text-[13px] font-black text-[#075CFF]">Change</button>
                      </div>
                    </div>
                    <div>
                      <label className="flex items-center gap-2 text-[12px] font-black text-[#44506E]">Expanding to nearby areas <span className="grid h-4 w-4 place-items-center rounded-full border border-[#AEB8CE] text-[10px] text-[#697391]">i</span></label>
                      <button className="mt-2 flex h-11 w-full items-center justify-between rounded-[8px] border border-[#D7DFF0] bg-white px-3 text-[13px] font-black text-[#44506E]">
                        1.5 km radius
                        <ChevronDown size={16} />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="p-5">
                  <h3 className="text-[15px] font-black">Account Management</h3>
                  <div className="mt-4 divide-y divide-[#E4E9F4]">
                    <SettingsActionRow
                      title={user?.has_passcode ? 'Reset Passcode' : 'Set Passcode'}
                      description={user?.has_passcode ? 'Change the passcode requested after OTP verification.' : 'Add an extra lock after OTP verification.'}
                      button={user?.has_passcode ? 'Reset Passcode' : 'Set Passcode'}
                      icon={<ShieldCheck size={17} />}
                      onClick={() => setPasscodeModalOpen(true)}
                    />
                    <SettingsActionRow
                      title="Deactivate Account"
                      description="Temporarily deactivate your account and hide your profile."
                      button="Deactivate"
                      onClick={() => toast('Deactivate account is not enabled yet')}
                    />
                    <SettingsActionRow
                      danger
                      title="Delete Account"
                      description="Permanently delete your account and all your data."
                      button="Delete Account"
                      onClick={() => toast('Delete account is not enabled yet')}
                    />
                  </div>
                </div>
              </div>
            </section>
          )}
        </main>

        <aside className="hidden space-y-4 xl:block">
          <Panel title="Profile Strength">
            <div className="flex items-center gap-5">
              <div className="grid h-20 w-20 place-items-center rounded-full border-[7px] border-[#075CFF] text-[18px] font-black">{profileStrength}%</div>
              <p className="text-[13px] font-semibold leading-relaxed text-[#44506E]">Complete your profile so neighbours know who they are talking to.</p>
            </div>
            <div className="mt-5 space-y-3">
              {checks.map(([item, done]) => (
                <p key={item} className="flex items-center gap-2 text-[13px] font-semibold text-[#44506E]">
                  {done ? <CheckCircle2 size={15} className="text-[#4CBF7A]" /> : <span className="h-[15px] w-[15px] rounded-full border-2 border-[#697391]" />}
                  {item}
                </p>
              ))}
            </div>
          </Panel>

          <Panel title="Top Communities"><EmptyPanelText>No communities yet</EmptyPanelText></Panel>
          <Panel title="Upcoming Events"><EmptyPanelText>No events</EmptyPanelText></Panel>

          <button onClick={handleLogout} className="flex h-12 w-full items-center justify-center gap-2 rounded-[9px] border border-red-200 bg-red-50 text-[13px] font-black text-red-600">
            <LogOut size={16} />
            Sign Out
          </button>
        </aside>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#081234]/50 px-4 py-6 backdrop-blur-sm md:hidden">
          <div className="form-hero max-h-[88vh] w-full overflow-hidden">
            <div className="flex items-center justify-between border-b border-[#E4E9F4] px-5 py-4">
              <div>
                <h2 className="text-[22px] font-black tracking-[-0.03em] text-[#081234]">Edit Profile</h2>
                <p className="mt-1 text-[12px] font-semibold text-[#697391]">Update what people see before they message or connect.</p>
              </div>
              <button onClick={() => setEditing(false)} className="grid h-10 w-10 place-items-center rounded-full bg-[#F1F5FF] text-[#697391]">
                <X size={18} />
              </button>
            </div>
            <div className="max-h-[calc(88vh-84px)] overflow-y-auto px-5 py-5">
              <EditPanel username={username} pincode={pincode} bio={bio} locationText={locationText} websiteUrl={websiteUrl} interests={interests} setUsername={setUsername} setPincode={setPincode} setBio={setBio} setLocationText={setLocationText} setWebsiteUrl={setWebsiteUrl} toggleInterest={toggleInterest} />
            </div>
            <SaveButtons loading={loading || avatarUploading || coverUploading} onSave={handleSave} onCancel={() => setEditing(false)} />
          </div>
        </div>
      )}

      {editing && (
        <div className="hidden px-9 pb-8 md:block xl:ml-0">
          <div className="mx-auto mt-4 max-w-[1220px]"><SaveButtons loading={loading || avatarUploading || coverUploading} onSave={handleSave} onCancel={() => setEditing(false)} /></div>
        </div>
      )}

      {passcodeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#081234]/50 px-4 py-6 backdrop-blur-sm sm:items-center">
          <div className="form-card w-full max-w-md overflow-hidden">
            <div className="flex items-start gap-3 border-b border-[#E4E9F4] p-5">
              <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-[10px] bg-[#FFF4E8] text-[#F97316]">
                <AlertTriangle size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-[19px] font-black tracking-[-0.03em]">{user?.has_passcode ? 'Reset passcode' : 'Set account passcode'}</h2>
                <p className="mt-1 text-[13px] font-semibold leading-relaxed text-[#697391]">
                  After setting this, every OTP login will ask for this passcode. You can reset it only after logging in and coming back to Profile Settings.
                </p>
              </div>
              <button onClick={() => setPasscodeModalOpen(false)} className="grid h-9 w-9 place-items-center rounded-full bg-[#F1F5FF] text-[#697391] hover:text-[#081234]">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <div className="rounded-[10px] border border-[#FFE0B8] bg-[#FFF9F0] p-3 text-[12px] font-bold leading-relaxed text-[#8A4B10]">
                Do not forget this passcode. OTP alone will not open your account once this is enabled.
              </div>
              <label className="block">
                <span className="form-label mb-2">New Passcode</span>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  value={passcodeDraft}
                  onChange={e => setPasscodeDraft(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  placeholder="4 to 8 digits"
                  className="form-input text-center text-[18px] tracking-[0.22em]"
                />
              </label>
              <label className="block">
                <span className="form-label mb-2">Confirm Passcode</span>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  value={passcodeConfirm}
                  onChange={e => setPasscodeConfirm(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  placeholder="Repeat passcode"
                  className="form-input text-center text-[18px] tracking-[0.22em]"
                />
              </label>
            </div>

            <div className="flex justify-end gap-3 border-t border-[#E4E9F4] p-4">
              <button onClick={() => setPasscodeModalOpen(false)} className="h-11 rounded-[12px] border border-[#D7DFF0] bg-white px-5 text-[13px] font-black text-[#44506E] shadow-[0_12px_28px_rgba(30,56,104,0.04)]">Cancel</button>
              <button onClick={savePasscode} disabled={passcodeSaving} className="flex h-11 items-center gap-2 rounded-[12px] bg-[#075CFF] px-5 text-[13px] font-black text-white shadow-[0_14px_30px_rgba(7,92,255,0.22)] disabled:opacity-60">
                {passcodeSaving ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
                {user?.has_passcode ? 'Reset Passcode' : 'Set Passcode'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function EditPanel({
  username,
  pincode,
  bio,
  locationText,
  websiteUrl,
  interests,
  setUsername,
  setPincode,
  setBio,
  setLocationText,
  setWebsiteUrl,
  toggleInterest,
}: {
  username: string
  pincode: string
  bio: string
  locationText: string
  websiteUrl: string
  interests: string[]
  setUsername: (value: string) => void
  setPincode: (value: string) => void
  setBio: (value: string) => void
  setLocationText: (value: string) => void
  setWebsiteUrl: (value: string) => void
  toggleInterest: (value: string) => void
}) {
  return (
    <div className="space-y-5">
      <div className="form-surface p-4 sm:p-5">
        <div className="mb-4">
          <div className="form-kicker">
            <UserRound size={12} className="text-[#075CFF]" />
            Public identity
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="form-label mb-2">Display name</span>
          <input value={username} onChange={e => setUsername(e.target.value.replace(/[^a-z0-9_. ]/gi, '').slice(0, 30))} placeholder="Your public name" className="form-input" />
        </label>
        <label className="block">
          <span className="form-label mb-2">Primary pincode</span>
          <input value={pincode} onChange={e => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="400001" className="form-input" />
        </label>
        </div>
      </div>

      <label className="form-section block p-4 sm:p-5">
        <div className="mb-2 flex items-center justify-between">
          <span className="form-label mb-0">Bio</span>
          <span className="text-[11px] font-bold text-[#8B96B2]">{bio.length}/240</span>
        </div>
        <textarea
          value={bio}
          onChange={e => setBio(e.target.value.slice(0, 240))}
          placeholder="Tell neighbours what you care about, what you do, or how you help locally."
          className="form-textarea min-h-[150px]"
        />
      </label>

      <div className="form-surface p-4 sm:p-5">
        <div className="mb-4">
          <div className="form-kicker">
            <MapPin size={12} className="text-[#075CFF]" />
            Local details
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="form-label mb-2">Local area</span>
          <input value={locationText} onChange={e => setLocationText(e.target.value.slice(0, 120))} placeholder="Versova, Mumbai" className="form-input" />
        </label>
        <label className="block">
          <span className="form-label mb-2">Website or social link</span>
          <input value={websiteUrl} onChange={e => setWebsiteUrl(e.target.value.trim().slice(0, 180))} placeholder="https://instagram.com/you" className="form-input" />
        </label>
        </div>
      </div>

      <div className="form-section p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <span className="form-label mb-0">Interests</span>
          <span className="text-[11px] font-bold text-[#8B96B2]">{interests.length} selected</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map(c => {
            const selected = interests.includes(c.label)
            return (
              <button key={c.label} type="button" onClick={() => toggleInterest(c.label)} className={`rounded-[12px] px-3 py-2 text-[12px] font-black transition-all ${selected ? 'form-chip form-chip-active' : 'form-chip'}`}>
                <span className="mr-2">{c.emoji}</span>{c.label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function SaveButtons({ loading, onSave, onCancel }: { loading: boolean; onSave: () => void; onCancel: () => void }) {
  return (
    <div className="form-action-bar flex justify-end gap-3 px-5 pb-5 pt-4 md:px-0 md:pb-0">
      <button onClick={onCancel} className="h-11 rounded-[12px] border border-[#D7DFF0] bg-white px-5 text-[13px] font-black text-[#44506E] shadow-[0_12px_28px_rgba(30,56,104,0.04)]">Cancel</button>
      <button onClick={onSave} disabled={loading} className="flex h-11 items-center gap-2 rounded-[12px] bg-[#075CFF] px-5 text-[13px] font-black text-white shadow-[0_14px_30px_rgba(7,92,255,0.22)] disabled:opacity-60">
        {loading ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
        Save Profile
      </button>
    </div>
  )
}

function SettingsActionRow({ title, description, button, icon, danger = false, onClick }: { title: string; description: string; button: string; icon?: React.ReactNode; danger?: boolean; onClick: () => void }) {
  return (
    <div className="grid gap-3 py-4 md:grid-cols-[minmax(0,1fr)_180px] md:items-center">
      <div className="min-w-0">
        <h4 className={`flex items-center gap-2 text-[14px] font-black ${danger ? 'text-red-500' : 'text-[#081234]'}`}>
          {icon && <span className={danger ? 'text-red-500' : 'text-[#075CFF]'}>{icon}</span>}
          {title}
        </h4>
        <p className="mt-1 text-[12px] font-semibold leading-relaxed text-[#697391]">{description}</p>
      </div>
      <button
        onClick={onClick}
        className={`h-11 rounded-[8px] border px-4 text-[13px] font-black ${
          danger
            ? 'border-red-200 bg-white text-red-500 hover:bg-red-50'
            : 'border-[#D7DFF0] bg-white text-[#44506E] hover:border-[#C9D6FF] hover:text-[#075CFF]'
        }`}
      >
        {button}
      </button>
    </div>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="text-[16px] font-black">{value}</p>
      <p className="mt-1 text-[12px] font-semibold text-[#697391]">{label}</p>
    </div>
  )
}

function MobileStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="border-r border-[#E4E9F4] px-2 py-4 text-center last:border-r-0">
      <p className="text-[16px] font-black text-[#081234]">{value}</p>
      <p className="mt-1 text-[11px] font-semibold leading-tight text-[#44506E]">{label}</p>
    </div>
  )
}

function MobileInfoCard({
  title,
  icon,
  onClick,
  children,
}: {
  title: string
  icon: React.ReactNode
  onClick?: () => void
  children: React.ReactNode
}) {
  return (
    <section className="rounded-[20px] border border-[#DDE5F3] bg-white p-5 shadow-[0_18px_44px_rgba(30,56,104,0.06)]">
      <div className="flex items-start gap-4">
        <div className="grid h-14 w-14 flex-shrink-0 place-items-center rounded-[16px] bg-[#F5F8FF]">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-[16px] font-black text-[#081234]">{title}</h2>
            {onClick && (
              <button type="button" onClick={onClick} className="text-[#081234]">
                <ChevronRight size={22} />
              </button>
            )}
          </div>
          {children}
        </div>
      </div>
    </section>
  )
}

function MobileMiniCard({
  title,
  icon,
  onClick,
  children,
}: {
  title: string
  icon: React.ReactNode
  onClick?: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[20px] border border-[#DDE5F3] bg-white p-4 text-left shadow-[0_18px_44px_rgba(30,56,104,0.06)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="grid h-12 w-12 place-items-center rounded-[14px] bg-[#F5F8FF]">
          {icon}
        </div>
        <ChevronRight size={20} className="mt-1 text-[#081234]" />
      </div>
      <h3 className="mt-4 text-[16px] font-black text-[#081234]">{title}</h3>
      <p className="mt-2 text-[13px] font-semibold leading-relaxed text-[#44506E]">{children}</p>
    </button>
  )
}

function MobileActionRow({
  title,
  icon,
  onClick,
  children,
}: {
  title: string
  icon: React.ReactNode
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-4 rounded-[18px] border border-[#DDE5F3] bg-white px-4 py-4 text-left shadow-[0_18px_44px_rgba(30,56,104,0.05)]"
    >
      <div className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-[14px] bg-[#EEF4FF]">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-black text-[#081234]">{title}</div>
        <div className="mt-1 text-[12px] font-semibold leading-relaxed text-[#697391]">{children}</div>
      </div>
      <ChevronRight size={20} className="flex-shrink-0 text-[#94A3B8]" />
    </button>
  )
}

function MobileSkylineBackdrop() {
  return (
    <div className="relative h-full w-full overflow-hidden bg-[linear-gradient(180deg,#EAF2FF_0%,#F8FBFF_100%)]">
      <div className="absolute inset-x-0 top-5 flex justify-between px-8 opacity-90">
        {[70, 54, 46, 62].map((width, index) => (
          <div key={width + index} className="h-5 rounded-full bg-white/70" style={{ width }} />
        ))}
      </div>
      <div className="absolute inset-x-6 bottom-0 flex items-end justify-between opacity-90">
        {[36, 58, 44, 54, 48, 56, 40].map((height, index) => (
          <div key={height + index} className="relative w-[44px]">
            <div className="absolute left-1/2 top-[-16px] h-0 w-0 -translate-x-1/2 border-l-[22px] border-r-[22px] border-b-[18px] border-l-transparent border-r-transparent border-b-[#AFC8FF]/70" />
            <div className="rounded-t-[6px] bg-[#BBD0FF]/75" style={{ height }} />
          </div>
        ))}
      </div>
      <div className="absolute inset-x-0 bottom-0 h-[70px] bg-[linear-gradient(180deg,rgba(206,223,255,0.05),rgba(181,203,255,0.35))]" />
      <div className="absolute right-[17%] top-[42%] text-[#A9C2FF]">
        <MapPin size={30} strokeWidth={2.2} />
      </div>
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[12px] border border-[#E1E7F3] bg-white p-5 shadow-[0_18px_48px_rgba(30,56,104,0.06)]">
      <div className="mb-5 flex items-center justify-between"><h2 className="text-[15px] font-black">{title}</h2></div>
      {children}
    </section>
  )
}

function EmptyPanelText({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[10px] border border-dashed border-[#D7DFF0] bg-white px-4 py-8 text-center text-[13px] font-bold text-[#697391]">{children}</div>
  )
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-3 rounded-[10px] border border-[#DDE5F3] bg-white px-4 py-8 text-[13px] font-bold text-[#697391]">
      <Loader2 size={17} className="animate-spin text-[#075CFF]" />
      {label}
    </div>
  )
}

function ConnectionSection({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children
  const hasItems = Array.isArray(items) ? items.length > 0 : Boolean(items)
  return (
    <section className="overflow-hidden rounded-[12px] border border-[#DDE5F3] bg-white shadow-[0_18px_44px_rgba(30,56,104,0.06)]">
      <div className="border-b border-[#E4E9F4] px-4 py-3">
        <h3 className="text-[14px] font-black text-[#081234]">{title}</h3>
      </div>
      {hasItems ? <div className="divide-y divide-[#E4E9F4]">{items}</div> : <div className="px-4 py-7"><EmptyPanelText>{empty}</EmptyPanelText></div>}
    </section>
  )
}

function ConnectionRow({ person, busy, onToggle }: { person: ConnectionUser; busy: boolean; onToggle: (person: ConnectionUser) => void }) {
  const name = person.username ?? person.phone
  return (
    <div className="flex items-center gap-3 p-4">
      <Avatar name={name} src={person.avatar_url} size={44} className="!rounded-full" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-[14px] font-black text-[#081234]">{name}</p>
          {person.follows_you && <span className="rounded-full bg-[#EAF2FF] px-2 py-0.5 text-[11px] font-black text-[#075CFF]">Follows you</span>}
        </div>
        <p className="mt-1 text-[12px] font-semibold text-[#697391]">
          {person.primary_pincode} · {person.follower_count ?? 0} followers
        </p>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => onToggle(person)}
        className={`inline-flex h-10 min-w-[108px] items-center justify-center gap-2 rounded-[8px] px-4 text-[12px] font-black disabled:opacity-60 ${person.is_following ? 'border border-[#D7DFF0] bg-white text-[#44506E]' : 'bg-[#075CFF] text-white shadow-[0_12px_28px_rgba(7,92,255,0.22)]'}`}
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : person.is_following ? <Users size={14} /> : <UserPlus size={14} />}
        {person.is_following ? 'Following' : 'Connect'}
      </button>
    </div>
  )
}

function ProfileGroupCard({ group, onOpen }: { group: Group; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="flex w-full items-center gap-3 rounded-[12px] border border-[#DDE5F3] bg-white p-4 text-left shadow-[0_12px_30px_rgba(30,56,104,0.04)] hover:bg-[#F7FAFF]">
      <Avatar name={group.name} src={group.cover_image_url} size={52} className="!rounded-full" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-black text-[#081234]">{group.name}</p>
        <p className="mt-1 text-[12px] font-semibold text-[#697391]">{group.category} · {group.member_count} members</p>
        <p className="mt-1 text-[11px] font-bold uppercase text-[#075CFF]">{group.role ?? 'member'}</p>
      </div>
    </button>
  )
}

function ActivityRow({ activity }: { activity: UserActivity }) {
  const isComment = activity.type === 'comment'
  const Icon = isComment ? MessageCircle : Heart
  const action = isComment ? 'commented on' : 'liked'
  const postTitle = activity.post.content_text?.trim().split(/\r?\n/)[0] || 'a local post'
  return (
    <div className="flex gap-4 border-b border-[#E4E9F4] p-4 last:border-b-0">
      <div className={`grid h-10 w-10 flex-shrink-0 place-items-center rounded-full ${isComment ? 'bg-[#EAF2FF] text-[#075CFF]' : 'bg-[#FFECEF] text-[#F04438]'}`}>
        <Icon size={18} fill={!isComment ? 'currentColor' : 'none'} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-black text-[#081234]">
          You {action} <span className="text-[#075CFF]">{activity.post.group?.name ?? 'a group'}</span>
        </p>
        <p className="mt-1 line-clamp-1 text-[13px] font-semibold text-[#44506E]">{postTitle}</p>
        {activity.content && <p className="mt-2 rounded-[8px] bg-[#F7FAFF] px-3 py-2 text-[13px] font-semibold text-[#172143]">{activity.content}</p>}
        <p className="mt-2 text-[12px] font-semibold text-[#697391]">{new Date(activity.created_at).toLocaleString('en-IN')}</p>
      </div>
    </div>
  )
}
