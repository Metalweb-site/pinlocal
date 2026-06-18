'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AtSign, BarChart3, CalendarDays, ChevronDown, Clock3, Hash, Image as ImageIcon, Loader2, Lock, MapPin, MessageCircle, Send, ShieldCheck, SmilePlus, Sparkles, ToggleLeft, ToggleRight, Unlock, Upload, UserRound, Users, X } from 'lucide-react'
import { createGroup, createPost, getMediaAsset, getMyGroups, uploadMedia } from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'
import { useAuth } from '@/hooks/useAuth'
import { CATEGORIES, Group } from '@/types'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import toast from 'react-hot-toast'
import { useFeedStore } from '@/store/feed.store'
import { IMAGE_FILE_ACCEPT, MEDIA_FILE_ACCEPT, isVideoUrl, validateMediaFile } from '@/lib/media'

type PendingMedia = {
  assetId: string
  url: string
  thumbnailUrl?: string | null
  status: 'processing' | 'ready'
}

export default function CreatePage() {
  const { loading: authLoading } = useAuth()
  const router = useRouter()
  const { user, activePincode } = useAuthStore()
  const { setCategory: setFeedCategory, setPosts, setPage, setHasMore } = useFeedStore()

  const [mode, setMode] = useState<'post' | 'group' | 'event'>('post')
  const [groups, setGroups] = useState<Group[]>([])
  const [groupsLoading, setGroupsLoading] = useState(true)
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [groupPickerOpen, setGroupPickerOpen] = useState(false)
  const [postCategory, setPostCategory] = useState<'Help' | 'Buy & Sell' | 'Announcement'>('Help')
  const [selectedHashtags, setSelectedHashtags] = useState<string[]>(['neighbourhood'])
  const [postText, setPostText] = useState('')
  const [postMedia, setPostMedia] = useState<PendingMedia[]>([])
  const [postLoading, setPostLoading] = useState(false)
  const [postUploading, setPostUploading] = useState(false)
  const [postUploadProgress, setPostUploadProgress] = useState(0)
  const [postProcessingIds, setPostProcessingIds] = useState<string[]>([])
  const [retryMediaFile, setRetryMediaFile] = useState<File | null>(null)
  const [allowComments, setAllowComments] = useState(true)
  const [allowReactions, setAllowReactions] = useState(true)
  const postMediaRef = useRef<HTMLInputElement | null>(null)
  const [eventTitle, setEventTitle] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [eventTime, setEventTime] = useState('')
  const [eventVenue, setEventVenue] = useState('')
  const [eventDetails, setEventDetails] = useState('')
  const [eventLoading, setEventLoading] = useState(false)

  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [category, setCategory] = useState('Residents')
  const [type, setType] = useState<'open' | 'private'>('open')
  const [coverUrl, setCoverUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)

  const openMode = (nextMode: 'post' | 'group' | 'event') => {
    setMode(nextMode)
    window.history.replaceState(null, '', `/create?mode=${nextMode}`)
  }

  const popularHashtags = [
    { tag: 'neighbourhood', category: 'Announcement' as const },
    { tag: 'help', category: 'Help' as const },
    { tag: 'lostandfound', category: 'Help' as const },
    { tag: 'water', category: 'Help' as const },
    { tag: 'safety', category: 'Announcement' as const },
    { tag: 'traffic', category: 'Announcement' as const },
    { tag: 'buyandsell', category: 'Buy & Sell' as const },
    { tag: 'market', category: 'Buy & Sell' as const },
    { tag: 'rent', category: 'Buy & Sell' as const },
    { tag: 'announcement', category: 'Announcement' as const },
  ]
  const postingGroups = groups.filter(group => group.role === 'admin' || group.role === 'moderator')
  const selectedShareGroup = postingGroups.find(group => group.id === selectedGroupId) ?? null
  const groupRoleLabel = (group: Group) => group.role === 'admin' ? 'Admin' : 'Moderator'

  useEffect(() => {
    const requestedMode = new URLSearchParams(window.location.search).get('mode')
    if (requestedMode === 'group' || requestedMode === 'event' || requestedMode === 'post') {
      setMode(requestedMode)
    }
  }, [])

  useEffect(() => {
    if (authLoading) return

    setGroupsLoading(true)
    getMyGroups()
      .then(res => {
        const mine = res.data.groups ?? []
        setGroups(mine)
        const eligible = mine.filter((group: Group) => group.role === 'admin' || group.role === 'moderator')
        setSelectedGroupId(current => eligible.some((group: Group) => group.id === current) ? current : eligible[0]?.id || '')
      })
      .catch(() => toast.error('Could not load your groups'))
      .finally(() => setGroupsLoading(false))
  }, [authLoading, mode])

  const handleCover = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const validationError = validateMediaFile(file, { imageOnly: true })
    if (validationError) {
      toast.error(validationError)
      e.target.value = ''
      return
    }
    setUploading(true)
    try {
      const res = await uploadMedia(file)
      setCoverUrl(res.data.url)
      toast.success('Cover uploaded')
    } catch {
      toast.error('Upload failed')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const waitForProcessedMedia = async (assetId: string, fallbackUrl: string) => {
    setPostProcessingIds(current => [...current, assetId])
    try {
      for (let attempt = 0; attempt < 18; attempt += 1) {
        await new Promise(resolve => window.setTimeout(resolve, attempt < 6 ? 1500 : 3000))
        const res = await getMediaAsset(assetId)
        const media = res.data
        if (media.status === 'ready') {
          const finalUrl = media.processed_url ?? media.url
          setPostMedia(current => current.map(item => item.url === fallbackUrl ? { ...item, url: finalUrl, thumbnailUrl: media.thumbnail_url, status: 'ready' } : item))
          toast.success(media.media_type === 'video' ? 'Video processed' : 'Image optimized')
          return
        }
        if (media.status === 'failed' || media.status === 'rejected') {
          toast.error(media.error_message ?? 'Media processing failed')
          return
        }
      }
    } finally {
      setPostProcessingIds(current => current.filter(id => id !== assetId))
    }
  }

  const uploadPostMediaFile = async (file: File) => {
    if (postMedia.length >= 5) {
      toast.error('You can attach up to 5 media files per post')
      return
    }
    const validationError = validateMediaFile(file)
    if (validationError) {
      toast.error(validationError)
      return
    }
    setPostUploading(true)
    setPostUploadProgress(0)
    setRetryMediaFile(null)
    try {
      const res = await uploadMedia(file, setPostUploadProgress)
      const mediaUrl = res.data.processed_url ?? res.data.url
      setPostMedia(current => [...current, {
        assetId: res.data.asset_id,
        url: mediaUrl,
        thumbnailUrl: res.data.thumbnail_url,
        status: res.data.status === 'ready' ? 'ready' : 'processing',
      }])
      toast.success(res.data.status === 'ready' ? 'Media attached' : 'Media uploaded. Processing started')
      if (res.data.asset_id && res.data.status !== 'ready') {
        void waitForProcessedMedia(res.data.asset_id, mediaUrl)
      }
    } catch (error: any) {
      setRetryMediaFile(file)
      toast.error(error?.response?.data?.message ?? 'Upload failed')
    } finally {
      setPostUploading(false)
      setPostUploadProgress(0)
    }
  }

  const handlePostMedia = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      await uploadPostMediaFile(file)
    } finally {
      e.target.value = ''
    }
  }

  const handleCreatePost = async () => {
    if (!selectedShareGroup) return toast.error('Choose a group where you are admin or moderator')
    if (!postText.trim() && postMedia.length === 0) return toast.error('Write something or attach media')

    setPostLoading(true)
    try {
      await createPost({
        group_id: selectedShareGroup.id,
        category: postCategory,
        content_text: postText.trim() || undefined,
        media_asset_ids: postMedia.map(item => item.assetId),
        media_urls: postMedia.map(item => item.url),
        hashtags: selectedHashtags,
      })
      setFeedCategory(postCategory)
      setPosts([])
      setPage(1)
      setHasMore(true)
      toast.success('Post published')
      router.push('/feed')
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Could not publish post')
    } finally {
      setPostLoading(false)
    }
  }

  const toggleHashtag = (tag: string, categoryForTag: typeof postCategory) => {
    setSelectedHashtags(current => {
      const exists = current.includes(tag)
      const next = exists ? current.filter(item => item !== tag) : [...current, tag]
      return next.slice(0, 8)
    })
    setPostCategory(categoryForTag)
  }

  const handleCreateEvent = async () => {
    if (!selectedGroupId) return toast.error('Choose a group where you are admin or moderator')
    if (!eventTitle.trim()) return toast.error('Event title is required')
    if (!eventDate) return toast.error('Event date is required')
    if (!eventTime) return toast.error('Event time is required')
    if (!eventVenue.trim()) return toast.error('Event venue is required')

    setEventLoading(true)
    try {
      await createPost({
        group_id: selectedGroupId,
        category: 'Events',
        content_text: [
          `Event: ${eventTitle.trim()}`,
          `Date: ${eventDate}`,
          `Time: ${eventTime}`,
          `Venue: ${eventVenue.trim()}`,
          '',
          eventDetails.trim(),
        ].filter(Boolean).join('\n'),
        media_asset_ids: postMedia.map(item => item.assetId),
        media_urls: postMedia.map(item => item.url),
      })
      setFeedCategory('Events')
      setPosts([])
      setPage(1)
      setHasMore(true)
      toast.success('Event registered')
      router.push('/feed')
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Could not register event')
    } finally {
      setEventLoading(false)
    }
  }

  const handleCreateGroup = async () => {
    if (!name.trim()) return toast.error('Group name is required')
    setLoading(true)
    try {
      const res = await createGroup({
        name: name.trim(),
        description: desc.trim() || undefined,
        cover_image_url: coverUrl || undefined,
        category,
        type,
      })
      toast.success('Group created')
      const group = res.data.group
      if (group.default_thread_id) router.push(`/groups/${group.id}/threads/${group.default_thread_id}`)
      else router.push('/groups')
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Could not create group')
    } finally {
      setLoading(false)
    }
  }

  if (authLoading) return null

  return (
    <div className="min-h-screen flex flex-col pb-[92px]">
      <div className="px-5 pt-[max(env(safe-area-inset-top),20px)] xl:px-10">
        <div className="mx-auto w-full max-w-3xl pt-3">
          <div className="form-surface flex items-center gap-4 px-4 py-4 sm:px-5">
            <button
              onClick={() => router.back()}
              className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-[14px] border border-[#D8E2F2] bg-white text-[#081234] shadow-[0_12px_28px_rgba(30,56,104,0.05)] transition-all hover:border-[#C9D6FF] hover:text-[#075CFF] active:scale-90"
            >
              <X size={18} strokeWidth={2.5} />
            </button>
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.08em] text-[#697391]">
                {mode === 'post' ? 'Post builder' : mode === 'event' ? 'Event builder' : 'Group builder'}
              </p>
              <h1 className="mt-1 text-[24px] font-black leading-none tracking-[-0.04em] text-[#081234] sm:text-[28px]">
                {mode === 'post' ? 'Create a Post' : mode === 'event' ? 'Create Event' : 'Create Group'}
              </h1>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-6 flex flex-col gap-8 animate-fade-up xl:px-10">
        {mode === 'post' ? (
          <div className="mx-auto w-full max-w-3xl">
            <div className="form-hero p-5 sm:p-6">
              <div className="mb-6">
                <div className="form-kicker mb-4">
                  <Sparkles size={13} className="text-[#075CFF]" />
                  Local conversation
                </div>
                <h2 className="text-[28px] font-black tracking-[-0.04em] text-[#081234]">Create Post</h2>
                <p className="mt-2 max-w-2xl text-[14px] font-semibold leading-relaxed text-[#697391]">
                  Start a sharp, trustworthy neighbourhood update with better structure, tags, and media.
                </p>
              </div>

              <div className="form-surface space-y-5 p-4 sm:p-5">
                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_260px]">
                  <div>
                  <p className="form-label mb-2">Share in</p>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => postingGroups.length > 0 && setGroupPickerOpen(prev => !prev)}
                      disabled={groupsLoading || postingGroups.length === 0}
                      className="flex min-h-[58px] w-full items-center gap-3 rounded-[14px] border border-[#D8E2F2] bg-white px-4 py-3 text-left shadow-[0_14px_30px_rgba(30,56,104,0.05)] transition-all focus:border-[#075CFF] focus:outline-none focus:ring-4 focus:ring-[#075CFF]/10 disabled:cursor-not-allowed disabled:bg-[#F8FAFF]"
                    >
                      <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-[12px] bg-[#EAF2FF] text-[#075CFF]">
                        <Users size={18} />
                      </span>
                      <span className="min-w-0 flex-1">
                        {groupsLoading ? (
                          <span className="block text-[13px] font-black text-[#697391]">Loading groups...</span>
                        ) : selectedShareGroup ? (
                          <>
                            <span className="block truncate text-[14px] font-black text-[#081234]">{selectedShareGroup.name}</span>
                            <span className="mt-1 inline-flex rounded-full bg-[#EAF2FF] px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-[#075CFF]">
                              {groupRoleLabel(selectedShareGroup)}
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="block text-[13px] font-black text-[#081234]">No admin/moderator groups available</span>
                            <span className="mt-1 block text-[11px] font-semibold text-[#697391]">Create or manage a group first.</span>
                          </>
                        )}
                      </span>
                      {postingGroups.length > 0 && (
                        <ChevronDown size={17} className={`flex-shrink-0 text-[#697391] transition-transform ${groupPickerOpen ? 'rotate-180' : ''}`} />
                      )}
                    </button>
                    {groupPickerOpen && postingGroups.length > 0 && (
                      <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-30 max-h-64 overflow-y-auto rounded-[16px] border border-[#D8E2F2] bg-white p-2 shadow-[0_22px_54px_rgba(8,18,52,0.16)]">
                        {postingGroups.map(group => {
                          const active = selectedGroupId === group.id
                          return (
                            <button
                              key={group.id}
                              type="button"
                              onClick={() => {
                                setSelectedGroupId(group.id)
                                setGroupPickerOpen(false)
                              }}
                              className={`flex w-full items-center gap-3 rounded-[12px] px-3 py-3 text-left transition-all ${active ? 'bg-[#EEF4FF]' : 'hover:bg-[#F7FAFF]'}`}
                            >
                              <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-[11px] bg-[#EAF2FF] text-[#075CFF]">
                                <Users size={16} />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[13px] font-black text-[#081234]">{group.name}</span>
                                <span className="mt-1 block text-[11px] font-semibold text-[#697391]">{groupRoleLabel(group)} • {group.pincode}</span>
                              </span>
                              {active && <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full bg-[#075CFF]" />}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                  {postingGroups.length === 0 && (
                    <p className="form-helper">
                      You can publish posts only from groups where you are admin or moderator.
                    </p>
                  )}
                  </div>

                  <div className="form-section flex min-h-[92px] items-center px-4 text-left">
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="grid h-11 w-11 place-items-center rounded-full bg-[#EAF2FF] text-[#075CFF]"><UserRound size={19} /></span>
                      <span className="min-w-0">
                        <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.1em] text-[#697391]">Posting as</span>
                        <span className="block truncate text-[14px] font-black text-[#081234]">{user?.username ?? 'Resident'}</span>
                        <span className="mt-1 block text-[12px] font-semibold text-[#697391]">{activePincode || user?.primary_pincode || '000000'} area</span>
                      </span>
                    </span>
                  </div>
                </div>
              </div>

              <div className="py-6">
                <p className="mb-3 text-[14px] font-black text-[#081234]">What&apos;s on your mind, {user?.username?.split(' ')[0] ?? 'neighbour'}?</p>
                <textarea
                  value={postText}
                  onChange={e => setPostText(e.target.value)}
                  maxLength={2000}
                  rows={7}
                  placeholder="Share something with your community..."
                  className="form-textarea min-h-[170px]"
                />
                <div className="mt-1 text-right text-[11px] font-bold text-[#697391]">{postText.length}/2000</div>

                <div className="mt-5 flex flex-wrap gap-3">
                  <button type="button" onClick={() => postMediaRef.current?.click()} className="inline-flex h-11 items-center gap-2 rounded-[12px] border border-[#D8E2F2] bg-white px-4 text-[12px] font-black text-[#172143] shadow-[0_12px_28px_rgba(30,56,104,0.04)] hover:border-[#C9D6FF] hover:text-[#075CFF]">
                    {postUploading ? <Loader2 size={16} className="animate-spin text-[#075CFF]" /> : <ImageIcon size={16} className="text-[#16A34A]" />}
                    {postUploading ? `Uploading ${postUploadProgress}%` : postProcessingIds.length > 0 ? 'Processing media' : 'Photo / Video'}
                  </button>
                  <button type="button" onClick={() => toast('Polls are coming next')} className="inline-flex h-11 items-center gap-2 rounded-[12px] border border-[#D8E2F2] bg-white px-4 text-[12px] font-black text-[#172143] shadow-[0_12px_28px_rgba(30,56,104,0.04)] hover:border-[#C9D6FF] hover:text-[#075CFF]">
                    <BarChart3 size={16} className="text-[#075CFF]" />
                    Poll
                  </button>
                  <button type="button" onClick={() => toast('Feeling/activity is coming next')} className="inline-flex h-11 items-center gap-2 rounded-[12px] border border-[#D8E2F2] bg-white px-4 text-[12px] font-black text-[#172143] shadow-[0_12px_28px_rgba(30,56,104,0.04)] hover:border-[#C9D6FF] hover:text-[#075CFF]">
                    <SmilePlus size={16} className="text-[#F97316]" />
                    Feeling / Activity
                  </button>
                  <input ref={postMediaRef} type="file" accept={MEDIA_FILE_ACCEPT} className="hidden" onChange={handlePostMedia} />
                </div>

                {(postUploading || postProcessingIds.length > 0) && (
                  <div className="mt-3 overflow-hidden rounded-full bg-[#EAF2FF]">
                    <div
                      className="h-2 rounded-full bg-[#075CFF] transition-all"
                      style={{ width: `${postUploading ? postUploadProgress : 100}%` }}
                    />
                  </div>
                )}
                {retryMediaFile && (
                  <button
                    type="button"
                    onClick={() => uploadPostMediaFile(retryMediaFile)}
                    className="mt-3 rounded-[8px] border border-[#FCA5A5] bg-[#FEF2F2] px-4 py-2 text-[12px] font-black text-[#DC2626]"
                  >
                    Retry failed upload
                  </button>
                )}

                {postMedia.length > 0 && (
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    {postMedia.map(item => (
                      <div key={item.assetId || item.url} className="relative h-32 overflow-hidden rounded-[14px] border border-[#D7DFF0] shadow-[0_12px_28px_rgba(30,56,104,0.05)]">
                        {isVideoUrl(item.url) ? (
                          <video src={item.url} className="h-full w-full object-cover" controls autoPlay loop muted preload="metadata" playsInline />
                        ) : (
                          <img src={item.thumbnailUrl ?? item.url} alt="" className="h-full w-full object-cover" />
                        )}
                        {item.status === 'processing' && <span className="absolute bottom-2 left-2 rounded-full bg-black/60 px-2 py-1 text-[10px] font-black uppercase text-white">Processing</span>}
                        <button onClick={() => setPostMedia(current => current.filter(media => media.assetId !== item.assetId))} className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/60 text-white">
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-y border-[#E4E9F4] py-6">
                <p className="form-label mb-3">Add to your post</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <PostTool icon={<MapPin size={19} />} label="Location" onClick={() => toast(`Using ${activePincode || user?.primary_pincode || 'your pincode'}`)} />
                  <PostTool icon={<CalendarDays size={19} />} label="Event" onClick={() => openMode('event')} />
                  <PostTool icon={<AtSign size={19} />} label="Tag People" onClick={() => toast('Tagging people is coming next')} />
                  <PostTool icon={<Hash size={19} />} label="Hashtag" onClick={() => document.getElementById('popular-hashtags')?.scrollIntoView({ behavior: 'smooth', block: 'center' })} />
                </div>
              </div>

              <div id="popular-hashtags" className="border-b border-[#E4E9F4] py-6">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="form-label mb-1">Popular hashtags</p>
                    <p className="text-[11px] font-semibold text-[#697391]">Hashtags categorize your post for filters and discovery.</p>
                  </div>
                  <span className="rounded-full bg-[#EAF2FF] px-3 py-1 text-[11px] font-black text-[#075CFF]">{postCategory}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {popularHashtags.map(item => {
                    const active = selectedHashtags.includes(item.tag)
                    return (
                      <button
                        key={item.tag}
                        type="button"
                        onClick={() => toggleHashtag(item.tag, item.category)}
                        className={`rounded-full px-3 py-2 text-[12px] font-black transition-all ${active ? 'form-chip form-chip-active' : 'form-chip'}`}
                      >
                        #{item.tag}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="border-b border-[#E4E9F4] py-6">
                <p className="form-label mb-2">Post settings</p>
                <SettingToggle icon={<MessageCircle size={18} />} title="Allow comments" desc="Everyone can comment on this post" checked={allowComments} onClick={() => setAllowComments(v => !v)} />
                <SettingToggle icon={<ShieldCheck size={18} />} title="Allow reactions" desc="Everyone can react to this post" checked={allowReactions} onClick={() => setAllowReactions(v => !v)} />
                <button type="button" onClick={() => toast(selectedShareGroup ? `This post will publish in ${selectedShareGroup.name}` : 'Choose a group first')} className="flex w-full items-center justify-between gap-4 border-t border-[#E4E9F4] py-4 text-left">
                  <span className="flex min-w-0 items-center gap-3">
                    <Users size={18} className="text-[#44506E]" />
                    <span>
                      <span className="block text-[13px] font-black text-[#081234]">{selectedShareGroup ? `Share in ${selectedShareGroup.name}` : 'Select a group'}</span>
                      <span className="block text-[12px] font-semibold text-[#697391]">
                        {selectedShareGroup ? 'Posted by the group and available in feed filters' : 'Only admins and moderators can publish posts'}
                      </span>
                    </span>
                  </span>
                </button>
              </div>

              <div className="form-action-bar -mx-5 -mb-5 mt-2 flex flex-col gap-3 px-5 py-4 sm:-mx-6 sm:-mb-6 sm:flex-row sm:justify-end sm:px-6">
                <button type="button" onClick={() => toast('Drafts are coming next')} className="h-12 rounded-[12px] border border-[#D8E2F2] bg-white px-7 text-[13px] font-black text-[#44506E] shadow-[0_12px_28px_rgba(30,56,104,0.04)]">Save Draft</button>
                <button
                  type="button"
                  onClick={handleCreatePost}
                  disabled={postLoading || postUploading || postProcessingIds.length > 0 || !selectedShareGroup || (!postText.trim() && postMedia.length === 0)}
                  className="inline-flex h-12 items-center gap-2 rounded-[12px] bg-[#075CFF] px-8 text-[13px] font-black text-white shadow-[0_16px_34px_rgba(7,92,255,0.24)] disabled:opacity-50"
                >
                  {postLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  Post
                </button>
              </div>
            </div>
          </div>
        ) : mode === 'event' ? (
          <div className="mx-auto w-full max-w-3xl">
            <div className="form-hero p-5 sm:p-6">
              <div className="mb-6">
                <div className="form-kicker mb-4">
                  <CalendarDays size={13} className="text-[#075CFF]" />
                  Neighbourhood event
                </div>
                <h2 className="text-[28px] font-black tracking-[-0.04em] text-[#081234]">Create Event</h2>
                <p className="mt-2 max-w-2xl text-[14px] font-semibold leading-relaxed text-[#697391]">Set up a stronger event listing with the essentials people need at a glance.</p>
              </div>

              <div className="form-surface border-b-0 p-4 sm:p-5">
                <p className="form-label mb-3">Hosting group</p>
                {groupsLoading ? (
                  <div className="form-section grid h-24 place-items-center">
                    <Loader2 size={20} className="animate-spin text-[#075CFF]" />
                  </div>
                ) : postingGroups.length === 0 ? (
                  <div className="form-section p-5 text-center">
                    <p className="text-[13px] font-semibold leading-relaxed text-[#697391]">
                      Events can only be registered by a group admin or moderator.
                    </p>
                    <button onClick={() => openMode('group')} className="mt-4 inline-flex h-11 items-center rounded-[12px] bg-[#081234] px-5 text-[12px] font-black uppercase tracking-[0.08em] text-white">
                      Start Group
                    </button>
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {postingGroups.map(group => {
                      const active = selectedGroupId === group.id
                      return (
                        <button
                          key={group.id}
                          onClick={() => setSelectedGroupId(group.id)}
                          className={`form-section w-full p-4 text-left transition-all ${active ? 'border-[#9CB9FF] bg-[#F7FAFF] shadow-[0_18px_36px_rgba(7,92,255,0.10)]' : 'hover:border-[#C9D6FF]'}`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-[18px] font-black leading-none text-[#081234]">{group.name}</div>
                              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-[#697391]">
                                <span>{group.category}</span>
                                <span>&bull;</span>
                                <span>{group.pincode}</span>
                                <span>&bull;</span>
                                <span>{group.role === 'admin' ? 'Admin' : 'Moderator'}</span>
                              </div>
                            </div>
                            <div className={`h-5 w-5 flex-shrink-0 rounded-full border-2 ${active ? 'border-[#075CFF] bg-[#075CFF]' : 'border-[#C5D1E6] bg-white'}`} />
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="grid gap-5 py-6">
                <div>
                  <label className="form-label">Event title</label>
                  <input
                    value={eventTitle}
                    onChange={e => setEventTitle(e.target.value)}
                    maxLength={120}
                    placeholder="e.g. Sunday football match"
                    className="form-input text-[15px]"
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="form-label flex items-center gap-2"><CalendarDays size={13} /> Date</label>
                    <input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} className="form-input" />
                  </div>
                  <div>
                    <label className="form-label flex items-center gap-2"><Clock3 size={13} /> Time</label>
                    <input type="time" value={eventTime} onChange={e => setEventTime(e.target.value)} className="form-input" />
                  </div>
                </div>

                <div>
                  <label className="form-label">Venue</label>
                  <input
                    value={eventVenue}
                    onChange={e => setEventVenue(e.target.value)}
                    maxLength={160}
                    placeholder="e.g. Khar Gymkhana Ground"
                    className="form-input"
                  />
                </div>

                <div>
                  <label className="form-label">Event details</label>
                  <textarea
                    value={eventDetails}
                    onChange={e => setEventDetails(e.target.value)}
                    maxLength={2000}
                    rows={6}
                    placeholder="Tell neighbours what will happen, who can join, fees, requirements, contact info..."
                    className="form-textarea min-h-[180px]"
                  />
                </div>
              </div>

              <div className="border-y border-[#E4E9F4] py-6">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="form-label mb-1">Poster / media</p>
                    <p className="text-[11px] font-semibold text-[#697391]">Add a poster, banner, or short promo video.</p>
                  </div>
                  <span className="rounded-full bg-[#EAF2FF] px-3 py-1 text-[11px] font-black text-[#075CFF]">Optional</span>
                </div>

                {postMedia.length > 0 && (
                  <div className="mb-4 grid grid-cols-2 gap-3">
                    {postMedia.map(item => (
                      <div key={item.assetId || item.url} className="relative h-32 overflow-hidden rounded-[14px] border border-[#D7DFF0] shadow-[0_12px_28px_rgba(30,56,104,0.05)]">
                        {isVideoUrl(item.url) ? (
                          <video src={item.url} className="h-full w-full object-cover" controls autoPlay loop muted preload="metadata" playsInline />
                        ) : (
                          <img src={item.thumbnailUrl ?? item.url} alt="" className="h-full w-full object-cover" />
                        )}
                        {item.status === 'processing' && <span className="absolute bottom-2 left-2 rounded-full bg-black/60 px-2 py-1 text-[10px] font-black uppercase text-white">Processing</span>}
                        <button onClick={() => setPostMedia(current => current.filter(media => media.assetId !== item.assetId))} className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/60 text-white">
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <label className="form-upload flex min-h-[92px] cursor-pointer flex-col items-center justify-center gap-3 px-4 text-center active:scale-[0.99]">
                  <input type="file" accept={MEDIA_FILE_ACCEPT} className="hidden" onChange={handlePostMedia} />
                  {postUploading ? <Loader2 size={18} className="animate-spin text-[#075CFF]" /> : <Upload size={18} className="text-[#075CFF]" />}
                  <span className="text-[12px] font-black uppercase tracking-[0.08em] text-[#172143]">
                    {postUploading ? `Uploading ${postUploadProgress}%` : postProcessingIds.length > 0 ? 'Processing media' : 'Attach event media'}
                  </span>
                </label>

                {(postUploading || postProcessingIds.length > 0) && (
                  <div className="mt-3 overflow-hidden rounded-full bg-[#EAF2FF]">
                    <div
                      className="h-2 rounded-full bg-[#075CFF] transition-all"
                      style={{ width: `${postUploading ? postUploadProgress : 100}%` }}
                    />
                  </div>
                )}
                {retryMediaFile && (
                  <button
                    type="button"
                    onClick={() => uploadPostMediaFile(retryMediaFile)}
                    className="mt-3 rounded-[10px] border border-[#FCA5A5] bg-[#FEF2F2] px-4 py-2 text-[12px] font-black text-[#DC2626]"
                  >
                    Retry failed upload
                  </button>
                )}
              </div>

              <div className="form-action-bar -mx-5 -mb-5 mt-2 flex flex-col gap-3 px-5 py-4 sm:-mx-6 sm:-mb-6 sm:flex-row sm:justify-end sm:px-6">
                <button type="button" onClick={() => openMode('post')} className="h-12 rounded-[12px] border border-[#D8E2F2] bg-white px-6 text-[13px] font-black text-[#44506E] shadow-[0_12px_28px_rgba(30,56,104,0.04)]">
                  Back to Post
                </button>
                <Button
                  onClick={handleCreateEvent}
                  loading={eventLoading}
                  disabled={postUploading || postProcessingIds.length > 0 || !selectedGroupId || !eventTitle.trim() || !eventDate || !eventTime || !eventVenue.trim()}
                  className="h-12 rounded-[12px] px-7"
                >
                  Register Event
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-3xl">
            <div className="form-hero p-5 sm:p-6">
              <div className="mb-6">
                <div className="form-kicker mb-4">
                  <Users size={13} className="text-[#075CFF]" />
                  Community setup
                </div>
                <h2 className="text-[28px] font-black tracking-[-0.04em] text-[#081234]">Create Group</h2>
                <p className="mt-2 max-w-2xl text-[14px] font-semibold leading-relaxed text-[#697391]">Shape the identity of your group before the first member even joins.</p>
              </div>

              <div className="border-b border-[#E4E9F4] pb-6">
                <p className="form-label mb-3">Cover image</p>
                <label className="group block cursor-pointer">
                  <input type="file" accept={IMAGE_FILE_ACCEPT} className="hidden" onChange={handleCover} />
                  {coverUrl ? (
                    <div className="relative h-48 w-full overflow-hidden rounded-[16px] border border-[#D7DFF0] shadow-[0_16px_34px_rgba(30,56,104,0.08)] transition-transform group-hover:scale-[1.005]">
                      <img src={coverUrl} alt="" className="h-full w-full object-cover" />
                      <div className="absolute inset-0 flex items-center justify-center bg-[#081234]/35 opacity-0 transition-opacity group-hover:opacity-100">
                        <span className="rounded-full bg-white/90 px-4 py-2 text-[12px] font-black text-[#075CFF] shadow">Change cover</span>
                      </div>
                    </div>
                  ) : (
                    <div className="form-upload flex h-48 flex-col items-center justify-center gap-3 px-4 text-center">
                      {uploading ? (
                        <>
                          <Loader2 size={24} className="animate-spin text-[#075CFF]" />
                          <span className="text-[11px] font-black uppercase tracking-[0.08em] text-[#697391]">Uploading...</span>
                        </>
                      ) : (
                        <>
                          <div className="grid h-12 w-12 place-items-center rounded-[16px] bg-[#EAF2FF] text-[#075CFF]">
                            <Upload size={24} />
                          </div>
                          <span className="text-[12px] font-black uppercase tracking-[0.08em] text-[#172143]">Add a cover photo</span>
                          <span className="text-[11px] font-semibold text-[#697391]">This becomes the first visual people see before joining.</span>
                        </>
                      )}
                    </div>
                  )}
                </label>
              </div>

              <div className="grid gap-5 py-6">
                <div>
                  <label className="form-label">Group name</label>
                  <input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    maxLength={80}
                    placeholder="e.g. Versova Tennis Club"
                    className="form-input text-[15px]"
                  />
                </div>

                <div>
                  <div className="mb-3 flex items-center gap-2 text-[12px] font-black uppercase tracking-[0.08em] text-[#697391]">
                    Category <Sparkles size={13} className="text-[#075CFF]" />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {CATEGORIES.map(c => {
                      const selected = category === c.label
                      return (
                        <button
                          key={c.label}
                          onClick={() => setCategory(c.label)}
                          className={`rounded-[12px] px-4 py-2.5 text-[12px] font-black transition-all ${selected ? 'form-chip form-chip-active' : 'form-chip'}`}
                        >
                          <span className="mr-2">{c.emoji}</span>{c.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div>
                  <label className="form-label">Visibility</label>
                  <div className="grid grid-cols-2 gap-3">
                    {(['open', 'private'] as const).map(option => {
                      const active = type === option
                      return (
                        <button
                          key={option}
                          onClick={() => setType(option)}
                          className={`form-section flex flex-col items-center justify-center gap-3 p-5 transition-all ${active ? 'border-[#9CB9FF] bg-[#F7FAFF] text-[#075CFF] shadow-[0_18px_36px_rgba(7,92,255,0.10)]' : 'text-[#697391] hover:border-[#C9D6FF]'}`}
                        >
                          {option === 'open' ? <Unlock size={20} /> : <Lock size={20} />}
                          <span className="text-[14px] font-black uppercase tracking-[0.08em]">{option}</span>
                          <span className="text-[11px] font-semibold">{option === 'open' ? 'Anyone can discover and join' : 'Members join only after approval'}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="form-section flex items-center gap-4 px-4 py-4">
                  <div className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-full bg-[#EAF2FF] text-[#075CFF]">
                    <MapPin size={18} />
                  </div>
                  <div>
                    <div className="text-[12px] font-black uppercase tracking-[0.08em] text-[#697391]">Your pincode</div>
                    <div className="mt-1 text-[16px] font-black text-[#081234]">{activePincode || user?.primary_pincode || '000000'}</div>
                  </div>
                </div>

                <div>
                  <label className="form-label">About the group</label>
                  <textarea
                    value={desc}
                    onChange={e => setDesc(e.target.value)}
                    maxLength={400}
                    rows={5}
                    placeholder="Tell people what this group is for, how it should feel, and what kind of posts belong here..."
                    className="form-textarea min-h-[170px]"
                  />
                </div>
              </div>

              <div className="form-action-bar -mx-5 -mb-5 mt-2 flex flex-col gap-3 px-5 py-4 sm:-mx-6 sm:-mb-6 sm:flex-row sm:justify-end sm:px-6">
                <button type="button" onClick={() => openMode('post')} className="h-12 rounded-[12px] border border-[#D8E2F2] bg-white px-6 text-[13px] font-black text-[#44506E] shadow-[0_12px_28px_rgba(30,56,104,0.04)]">
                  Back to Post
                </button>
                <Button onClick={handleCreateGroup} loading={loading} disabled={!name.trim()} className="h-12 rounded-[12px] px-7">
                  Create Community
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="h-8" />
      </div>
    </div>
  )
}

function PostTool({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[72px] flex-col items-center justify-center gap-2 rounded-[9px] border border-[#D7DFF0] bg-white px-3 text-center text-[12px] font-black text-[#172143] transition hover:border-[#C9D6FF] hover:bg-[#F7FAFF] hover:text-[#075CFF] active:scale-[0.98]"
    >
      <span className="text-[#075CFF]">{icon}</span>
      {label}
    </button>
  )
}

function SettingToggle({ icon, title, desc, checked, onClick }: { icon: React.ReactNode; title: string; desc: string; checked: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center justify-between gap-4 border-t border-[#E4E9F4] py-4 text-left">
      <span className="flex min-w-0 items-center gap-3">
        <span className="text-[#44506E]">{icon}</span>
        <span>
          <span className="block text-[13px] font-black text-[#081234]">{title}</span>
          <span className="block text-[12px] font-semibold text-[#697391]">{desc}</span>
        </span>
      </span>
      {checked ? <ToggleRight size={34} className="flex-shrink-0 text-[#075CFF]" /> : <ToggleLeft size={34} className="flex-shrink-0 text-[#AEB8CE]" />}
    </button>
  )
}
