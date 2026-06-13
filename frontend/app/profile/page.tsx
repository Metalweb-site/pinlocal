'use client'

import { ChangeEvent, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Bookmark, CalendarDays, Camera, CheckCircle2, ChevronDown, ExternalLink, Globe, Heart, ImageIcon, Loader2, LogOut, MapPin, MessageCircle, Save, Search, Settings, ShieldCheck, UserPlus, UserRound, Users, X, Zap } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useAuthStore } from '@/store/auth.store'
import { followUser, getConnections, getMyGroups, getMyPosts, getProfileStats, getSavedPosts, getUserActivity, logout as apiLogout, searchUsers, setPasscode as apiSetPasscode, unfollowUser, updateMe, uploadMedia } from '@/lib/api'
import { IMAGE_FILE_ACCEPT, validateMediaFile } from '@/lib/media'
import Avatar from '@/components/shared/Avatar'
import NotificationBell from '@/components/shared/NotificationBell'
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

export default function ProfilePage() {
  const { user, loading: authLoading } = useAuth()
  const { setUser, logout } = useAuthStore()
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
    setLocationText(user?.location_text ?? '')
    setWebsiteUrl(user?.website_url ?? '')
    setAvatarUrl(user?.avatar_url ?? '')
    setCoverImageUrl(user?.cover_image_url ?? '')
    setInterests(user?.interests ?? [])
  }, [user])

  const refreshStats = () => {
    getProfileStats()
      .then(res => setStats(res.data.stats ?? { posts: 0, groups: 0, following: 0, followers: 0, events_attended: 0 }))
      .catch(() => undefined)
  }

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
  }, [authLoading, user?.id])

  const loadPosts = () => {
    if (postsLoading) return
    setPostsLoading(true)
    getMyPosts()
      .then(res => {
        setMyPosts(res.data.posts ?? [])
        setPostsLoaded(true)
      })
      .catch((error: any) => toast.error(error?.response?.data?.message ?? 'Could not load posts'))
      .finally(() => setPostsLoading(false))
  }

  const loadGroups = () => {
    if (groupsLoading) return
    setGroupsLoading(true)
    getMyGroups()
      .then(res => {
        setMyGroups(res.data.groups ?? [])
        setGroupsLoaded(true)
      })
      .catch((error: any) => toast.error(error?.response?.data?.message ?? 'Could not load groups'))
      .finally(() => setGroupsLoading(false))
  }

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
      const res = await updateMe({
        username: cleanUsername,
        primary_pincode: pincode,
        interests,
        bio: cleanBio,
        location_text: cleanLocation,
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
  }, [activeTab, authLoading, postsLoaded, postsLoading])

  useEffect(() => {
    if (authLoading || groupsLoaded || groupsLoading) return
    if (activeTab !== 'Groups') return
    loadGroups()
  }, [activeTab, authLoading, groupsLoaded, groupsLoading])

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
  const pincodeValue = user?.primary_pincode ?? '400001'
  const joined = user?.created_at ? new Date(user.created_at).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) : 'Not available'
  const checks = [
    ['Profile picture', Boolean(user?.avatar_url)],
    ['Cover photo', Boolean(user?.cover_image_url)],
    ['Name', Boolean(user?.username)],
    ['Bio', Boolean(user?.bio)],
    ['Local area', Boolean(user?.location_text)],
    ['Pincode', Boolean(user?.primary_pincode)],
    ['Add interests', (user?.interests?.length ?? 0) > 0],
  ] as const
  const profileStrength = Math.round((checks.filter(([, done]) => done).length / checks.length) * 100)

  return (
    <div className="min-h-screen bg-[#FBFCFF] font-body text-[#081234]">
      <div className="hidden xl:block">
        <header className="sticky top-0 z-30 border-b border-[#E4E9F4] bg-white/90 backdrop-blur-xl">
          <div className="mx-auto flex h-[76px] max-w-[1220px] items-center gap-8 px-9">
            <button className="flex h-10 items-center gap-3 rounded-[8px] border border-[#D7DFF0] bg-white px-3.5 text-[15px] font-black text-[#081234] shadow-[0_10px_30px_rgba(40,70,120,0.06)]">
              <MapPin size={20} className="text-[#075CFF]" strokeWidth={2.4} />
              {pincodeValue}
              <ChevronDown size={16} className="text-[#697391]" />
            </button>
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

      <div className="mx-auto grid max-w-[1220px] grid-cols-1 gap-8 px-4 pt-5 xl:grid-cols-[minmax(0,1fr)_300px] xl:px-9">
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
          <div className="w-full rounded-[14px] bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-black">Edit Profile</h2>
              <button onClick={() => setEditing(false)}><X size={20} /></button>
            </div>
            <EditPanel username={username} pincode={pincode} bio={bio} locationText={locationText} websiteUrl={websiteUrl} interests={interests} setUsername={setUsername} setPincode={setPincode} setBio={setBio} setLocationText={setLocationText} setWebsiteUrl={setWebsiteUrl} toggleInterest={toggleInterest} />
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
          <div className="w-full max-w-md overflow-hidden rounded-[14px] border border-[#DDE5F3] bg-white shadow-2xl">
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
                <span className="text-[12px] font-black text-[#44506E]">New Passcode</span>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  value={passcodeDraft}
                  onChange={e => setPasscodeDraft(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  placeholder="4 to 8 digits"
                  className="mt-2 h-11 w-full rounded-[8px] border border-[#D7DFF0] bg-white px-3 text-[18px] font-black tracking-[0.22em] text-[#081234] outline-none focus:border-[#075CFF]"
                />
              </label>
              <label className="block">
                <span className="text-[12px] font-black text-[#44506E]">Confirm Passcode</span>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  value={passcodeConfirm}
                  onChange={e => setPasscodeConfirm(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  placeholder="Repeat passcode"
                  className="mt-2 h-11 w-full rounded-[8px] border border-[#D7DFF0] bg-white px-3 text-[18px] font-black tracking-[0.22em] text-[#081234] outline-none focus:border-[#075CFF]"
                />
              </label>
            </div>

            <div className="flex justify-end gap-3 border-t border-[#E4E9F4] p-4">
              <button onClick={() => setPasscodeModalOpen(false)} className="h-11 rounded-[8px] border border-[#D7DFF0] bg-white px-5 text-[13px] font-black text-[#44506E]">Cancel</button>
              <button onClick={savePasscode} disabled={passcodeSaving} className="flex h-11 items-center gap-2 rounded-[8px] bg-[#075CFF] px-5 text-[13px] font-black text-white disabled:opacity-60">
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
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="text-[12px] font-black uppercase tracking-[0.08em] text-[#697391]">Display name</span>
          <input value={username} onChange={e => setUsername(e.target.value.replace(/[^a-z0-9_. ]/gi, '').slice(0, 30))} placeholder="Your public name" className="mt-2 h-12 w-full rounded-[9px] border border-[#D7DFF0] bg-white px-3 text-[14px] font-bold text-[#081234] outline-none transition focus:border-[#075CFF] focus:ring-4 focus:ring-[#075CFF]/10" />
        </label>
        <label className="block">
          <span className="text-[12px] font-black uppercase tracking-[0.08em] text-[#697391]">Primary pincode</span>
          <input value={pincode} onChange={e => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="400001" className="mt-2 h-12 w-full rounded-[9px] border border-[#D7DFF0] bg-white px-3 text-[14px] font-bold text-[#081234] outline-none transition focus:border-[#075CFF] focus:ring-4 focus:ring-[#075CFF]/10" />
        </label>
      </div>

      <label className="block">
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-black uppercase tracking-[0.08em] text-[#697391]">Bio</span>
          <span className="text-[11px] font-bold text-[#8B96B2]">{bio.length}/240</span>
        </div>
        <textarea
          value={bio}
          onChange={e => setBio(e.target.value.slice(0, 240))}
          placeholder="Tell neighbours what you care about, what you do, or how you help locally."
          className="mt-2 min-h-[108px] w-full resize-none rounded-[10px] border border-[#D7DFF0] bg-white px-3 py-3 text-[14px] font-semibold leading-relaxed text-[#081234] outline-none transition placeholder:text-[#8B96B2] focus:border-[#075CFF] focus:ring-4 focus:ring-[#075CFF]/10"
        />
      </label>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="text-[12px] font-black uppercase tracking-[0.08em] text-[#697391]">Local area</span>
          <input value={locationText} onChange={e => setLocationText(e.target.value.slice(0, 120))} placeholder="Versova, Mumbai" className="mt-2 h-12 w-full rounded-[9px] border border-[#D7DFF0] bg-white px-3 text-[14px] font-bold text-[#081234] outline-none transition focus:border-[#075CFF] focus:ring-4 focus:ring-[#075CFF]/10" />
        </label>
        <label className="block">
          <span className="text-[12px] font-black uppercase tracking-[0.08em] text-[#697391]">Website or social link</span>
          <input value={websiteUrl} onChange={e => setWebsiteUrl(e.target.value.trim().slice(0, 180))} placeholder="https://instagram.com/you" className="mt-2 h-12 w-full rounded-[9px] border border-[#D7DFF0] bg-white px-3 text-[14px] font-bold text-[#081234] outline-none transition focus:border-[#075CFF] focus:ring-4 focus:ring-[#075CFF]/10" />
        </label>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[12px] font-black uppercase tracking-[0.08em] text-[#697391]">Interests</span>
          <span className="text-[11px] font-bold text-[#8B96B2]">{interests.length} selected</span>
        </div>
        <div className="flex flex-wrap gap-2">
        {CATEGORIES.map(c => {
          const selected = interests.includes(c.label)
          return (
            <button key={c.label} type="button" onClick={() => toggleInterest(c.label)} className={`rounded-[8px] border px-3 py-2 text-[12px] font-black ${selected ? 'border-[#075CFF] bg-[#075CFF] text-white' : 'border-[#D7DFF0] bg-white text-[#44506E]'}`}>{c.label}</button>
          )
        })}
        </div>
      </div>
    </div>
  )
}

function SaveButtons({ loading, onSave, onCancel }: { loading: boolean; onSave: () => void; onCancel: () => void }) {
  return (
    <div className="flex justify-end gap-3">
      <button onClick={onCancel} className="h-11 rounded-[8px] border border-[#D7DFF0] bg-white px-5 text-[13px] font-black text-[#44506E]">Cancel</button>
      <button onClick={onSave} disabled={loading} className="flex h-11 items-center gap-2 rounded-[8px] bg-[#075CFF] px-5 text-[13px] font-black text-white disabled:opacity-60">
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
