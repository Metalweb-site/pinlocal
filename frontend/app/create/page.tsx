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
  const { user } = useAuthStore()
  const { setCategory: setFeedCategory, setPosts, setPage, setHasMore } = useFeedStore()

  const [mode, setMode] = useState<'post' | 'group' | 'event'>('post')
  const [groups, setGroups] = useState<Group[]>([])
  const [groupsLoading, setGroupsLoading] = useState(true)
  const [selectedGroupId, setSelectedGroupId] = useState('')
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
      <div className="sticky top-0 z-40 bg-surface/86 backdrop-blur-xl border-b border-border px-5 py-5 pt-safe flex items-center gap-4">
        <button
          onClick={() => router.back()}
          className="w-10 h-10 rounded-[10px] premium-inset flex items-center justify-center active:scale-90 transition-all hover:border-text1"
        >
          <X size={18} strokeWidth={2.5} />
        </button>
        <h1 className="font-display font-black text-[26px] uppercase tracking-tight leading-none">
          {mode === 'post' ? 'Create a Post' : mode === 'event' ? 'Register Event' : 'Start a Group'}
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-8 flex flex-col gap-8 animate-fade-up xl:px-10">
        {mode === 'post' ? (
          <div className="mx-auto w-full max-w-3xl">
            <div className="rounded-[14px] border border-[#DDE5F3] bg-white p-5 shadow-[0_22px_58px_rgba(30,56,104,0.08)]">
              <div className="mb-5">
                <h2 className="text-[22px] font-black tracking-[-0.03em] text-[#081234]">Create Post</h2>
                <p className="mt-1 text-[13px] font-semibold text-[#697391]">Share updates, ask questions, or start a local discussion.</p>
              </div>

              <div className="space-y-3 border-b border-[#E4E9F4] pb-5">
                <div>
                  <p className="mb-2 text-[12px] font-black text-[#081234]">Share in</p>
                  <div className="relative">
                    <Users size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#075CFF]" />
                    <select
                      value={selectedGroupId}
                      onChange={e => setSelectedGroupId(e.target.value)}
                      disabled={groupsLoading || postingGroups.length === 0}
                      className="h-12 w-full appearance-none rounded-[8px] border border-[#D7DFF0] bg-white pl-12 pr-10 text-left text-[13px] font-black text-[#172143] outline-none transition focus:border-[#075CFF] focus:ring-4 focus:ring-[#075CFF]/10"
                    >
                      {postingGroups.length === 0 && <option value="">No admin/moderator groups available</option>}
                      {postingGroups.map(group => (
                        <option key={group.id} value={group.id}>
                          {group.name} ({group.role === 'admin' ? 'main admin/admin' : 'moderator'})
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={16} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[#697391]" />
                  </div>
                  {postingGroups.length === 0 && (
                    <p className="mt-2 text-[11px] font-semibold text-[#697391]">
                      You can publish posts only from groups where you are admin or moderator.
                    </p>
                  )}
                </div>

                <button type="button" className="flex h-14 w-full items-center justify-between rounded-[8px] border border-[#D7DFF0] bg-white px-4 text-left">
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-[#EAF2FF] text-[#075CFF]"><UserRound size={18} /></span>
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-black text-[#081234]">{user?.username ?? 'Resident'}</span>
                      <span className="block text-[12px] font-semibold text-[#697391]">{user?.primary_pincode ?? '000000'}</span>
                    </span>
                  </span>
                  <ChevronDown size={16} className="text-[#697391]" />
                </button>
              </div>

              <div className="py-5">
                <p className="mb-3 text-[13px] font-black text-[#081234]">What's on your mind, {user?.username?.split(' ')[0] ?? 'neighbour'}?</p>
                <textarea
                  value={postText}
                  onChange={e => setPostText(e.target.value)}
                  maxLength={2000}
                  rows={7}
                  placeholder="Share something with your community..."
                  className="min-h-[158px] w-full resize-none rounded-[10px] border border-[#D7DFF0] bg-white px-4 py-4 text-[14px] font-semibold leading-relaxed text-[#081234] outline-none transition placeholder:text-[#8B96B2] focus:border-[#075CFF] focus:ring-4 focus:ring-[#075CFF]/10"
                />
                <div className="mt-1 text-right text-[11px] font-bold text-[#697391]">{postText.length}/2000</div>

                <div className="mt-4 flex flex-wrap gap-3">
                  <button type="button" onClick={() => postMediaRef.current?.click()} className="inline-flex h-10 items-center gap-2 rounded-[8px] border border-[#D7DFF0] bg-white px-4 text-[12px] font-black text-[#172143] hover:border-[#C9D6FF] hover:text-[#075CFF]">
                    {postUploading ? <Loader2 size={16} className="animate-spin text-[#075CFF]" /> : <ImageIcon size={16} className="text-[#16A34A]" />}
                    {postUploading ? `Uploading ${postUploadProgress}%` : postProcessingIds.length > 0 ? 'Processing media' : 'Photo / Video'}
                  </button>
                  <button type="button" onClick={() => toast('Polls are coming next')} className="inline-flex h-10 items-center gap-2 rounded-[8px] border border-[#D7DFF0] bg-white px-4 text-[12px] font-black text-[#172143] hover:border-[#C9D6FF] hover:text-[#075CFF]">
                    <BarChart3 size={16} className="text-[#075CFF]" />
                    Poll
                  </button>
                  <button type="button" onClick={() => toast('Feeling/activity is coming next')} className="inline-flex h-10 items-center gap-2 rounded-[8px] border border-[#D7DFF0] bg-white px-4 text-[12px] font-black text-[#172143] hover:border-[#C9D6FF] hover:text-[#075CFF]">
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
                      <div key={item.assetId || item.url} className="relative h-32 overflow-hidden rounded-[10px] border border-[#D7DFF0]">
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

              <div className="border-y border-[#E4E9F4] py-5">
                <p className="mb-3 text-[12px] font-black text-[#081234]">Add to your post</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <PostTool icon={<MapPin size={19} />} label="Location" onClick={() => toast(`Using ${user?.primary_pincode ?? 'your pincode'}`)} />
                  <PostTool icon={<CalendarDays size={19} />} label="Event" onClick={() => openMode('event')} />
                  <PostTool icon={<AtSign size={19} />} label="Tag People" onClick={() => toast('Tagging people is coming next')} />
                  <PostTool icon={<Hash size={19} />} label="Hashtag" onClick={() => document.getElementById('popular-hashtags')?.scrollIntoView({ behavior: 'smooth', block: 'center' })} />
                </div>
              </div>

              <div id="popular-hashtags" className="border-b border-[#E4E9F4] py-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[12px] font-black text-[#081234]">Popular hashtags</p>
                    <p className="mt-1 text-[11px] font-semibold text-[#697391]">Hashtags categorize your post for filters and discovery.</p>
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
                        className={`rounded-full border px-3 py-2 text-[12px] font-black transition-all ${active ? 'border-[#075CFF] bg-[#075CFF] text-white shadow-[0_10px_24px_rgba(7,92,255,0.18)]' : 'border-[#D7DFF0] bg-white text-[#44506E] hover:border-[#C9D6FF] hover:text-[#075CFF]'}`}
                      >
                        #{item.tag}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="border-b border-[#E4E9F4] py-5">
                <p className="mb-2 text-[12px] font-black text-[#081234]">Post settings</p>
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

              <div className="flex justify-end gap-3 pt-5">
                <button type="button" onClick={() => toast('Drafts are coming next')} className="h-12 rounded-[8px] border border-[#D7DFF0] bg-white px-7 text-[13px] font-black text-[#44506E]">Save Draft</button>
                <button
                  type="button"
                  onClick={handleCreatePost}
                  disabled={postLoading || postUploading || postProcessingIds.length > 0 || !selectedShareGroup || (!postText.trim() && postMedia.length === 0)}
                  className="inline-flex h-12 items-center gap-2 rounded-[8px] bg-[#075CFF] px-8 text-[13px] font-black text-white shadow-[0_14px_32px_rgba(7,92,255,0.22)] disabled:opacity-50"
                >
                  {postLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  Post
                </button>
              </div>
            </div>
          </div>
        ) : mode === 'event' ? (
          <div className="space-y-8 max-w-3xl mx-auto w-full">
            <div>
              <div className="text-[10px] font-bold text-text3 tracking-[2px] uppercase font-mono mb-4 ml-1">Hosting Group</div>
              {groupsLoading ? (
                <div className="h-24 rounded-[12px] premium-card flex items-center justify-center">
                  <Loader2 size={20} className="animate-spin text-coral" />
                </div>
              ) : postingGroups.length === 0 ? (
                <div className="rounded-[12px] premium-card p-5 text-center">
                  <p className="text-text2 text-[13px] leading-relaxed mb-4">
                    Events can only be registered by a group admin or moderator.
                  </p>
                  <button onClick={() => openMode('group')} className="h-11 px-5 rounded-[8px] bg-text1 text-bg text-[12px] font-black uppercase tracking-widest">
                    Start Group
                  </button>
                </div>
              ) : (
                <div className="grid gap-2">
                  {postingGroups.map(group => {
                    const active = selectedGroupId === group.id
                    return (
                      <button
                        key={group.id}
                        onClick={() => setSelectedGroupId(group.id)}
                        className={`w-full p-4 rounded-[12px] text-left transition-all interactive-lift ${
                          active ? 'premium-card border-coral/50' : 'premium-inset hover:border-text1'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-display text-[22px] font-bold leading-none truncate">{group.name}</div>
                            <div className="mt-2 flex items-center gap-2 text-[11px] font-mono text-text3">
                              <span>{group.category}</span>
                              <span>-</span>
                              <span>{group.pincode}</span>
                            </div>
                          </div>
                          <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 ${active ? 'border-coral bg-coral' : 'border-white/20'}`} />
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <Input label="Event title" placeholder="e.g. Sunday football match" value={eventTitle} onChange={e => setEventTitle(e.target.value)} maxLength={120} className="text-[18px] h-14" />

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="text-[10px] font-bold text-text3 tracking-[2px] uppercase font-mono mb-3 ml-1 flex items-center gap-2"><CalendarDays size={12} /> Date</div>
                <input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} className="w-full h-14 premium-card rounded-[14px] px-5 text-text1 text-[15px] font-body outline-none focus:border-text1 transition-all" />
              </div>
              <div>
                <div className="text-[10px] font-bold text-text3 tracking-[2px] uppercase font-mono mb-3 ml-1 flex items-center gap-2"><Clock3 size={12} /> Time</div>
                <input type="time" value={eventTime} onChange={e => setEventTime(e.target.value)} className="w-full h-14 premium-card rounded-[14px] px-5 text-text1 text-[15px] font-body outline-none focus:border-text1 transition-all" />
              </div>
            </div>

            <Input label="Venue" placeholder="e.g. Khar Gymkhana Ground" value={eventVenue} onChange={e => setEventVenue(e.target.value)} maxLength={160} className="text-[16px] h-14" />

            <div>
              <div className="text-[10px] font-bold text-text3 tracking-[2px] uppercase font-mono mb-3 ml-1">Event details</div>
              <textarea
                value={eventDetails}
                onChange={e => setEventDetails(e.target.value)}
                maxLength={2000}
                rows={5}
                placeholder="Tell neighbours what will happen, who can join, fees, requirements, contact info..."
                className="w-full premium-card rounded-[14px] px-5 py-4 text-text1 text-[15px] font-body outline-none resize-none focus:border-text1 transition-all placeholder:text-text3/70"
              />
            </div>

            <div>
              <div className="text-[10px] font-bold text-text3 tracking-[2px] uppercase font-mono mb-3 ml-1">Poster / Media</div>
              {postMedia.length > 0 && (
                <div className="grid grid-cols-2 gap-3 mb-3">
                  {postMedia.map(item => (
                    <div key={item.assetId || item.url} className="relative h-28 rounded-[12px] overflow-hidden border border-border shadow-sm">
                      {isVideoUrl(item.url) ? (
                        <video src={item.url} className="w-full h-full object-cover" controls autoPlay loop muted preload="metadata" playsInline />
                      ) : (
                        <img src={item.thumbnailUrl ?? item.url} alt="" className="w-full h-full object-cover" />
                      )}
                      {item.status === 'processing' && <span className="absolute bottom-2 left-2 rounded-full bg-black/60 px-2 py-1 text-[10px] font-black uppercase text-white">Processing</span>}
                      <button onClick={() => setPostMedia(current => current.filter(media => media.assetId !== item.assetId))} className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 border border-white/20 flex items-center justify-center">
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <label className="h-14 rounded-[12px] border border-dashed border-border bg-surface flex items-center justify-center gap-3 cursor-pointer active:scale-[0.98] transition-all hover:border-text1">
                <input type="file" accept={MEDIA_FILE_ACCEPT} className="hidden" onChange={handlePostMedia} />
                {postUploading ? <Loader2 size={18} className="animate-spin text-coral" /> : <Upload size={18} className="text-coral" />}
                <span className="text-[12px] font-black uppercase tracking-widest text-text2">{postUploading ? `Uploading ${postUploadProgress}%` : postProcessingIds.length > 0 ? 'Processing media' : 'Attach media'}</span>
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
                  className="mt-3 rounded-[8px] border border-[#FCA5A5] bg-[#FEF2F2] px-4 py-2 text-[12px] font-black text-[#DC2626]"
                >
                  Retry failed upload
                </button>
              )}
            </div>

            <Button
              onClick={handleCreateEvent}
              loading={eventLoading}
              disabled={postUploading || postProcessingIds.length > 0 || !selectedGroupId || !eventTitle.trim() || !eventDate || !eventTime || !eventVenue.trim()}
              className="h-14 rounded-[10px]"
            >
              Register Event
            </Button>
          </div>
        ) : (
          <div className="space-y-8 max-w-3xl mx-auto w-full">
            <div>
              <div className="text-[10px] font-bold text-text3 tracking-[2px] uppercase font-mono mb-3 ml-1">Cover Image</div>
              <label className="block cursor-pointer group">
                <input type="file" accept={IMAGE_FILE_ACCEPT} className="hidden" onChange={handleCover} />
                {coverUrl ? (
                  <div className="relative w-full h-40 rounded-[14px] overflow-hidden border border-border shadow-lg transition-transform group-hover:scale-[1.01]">
                    <img src={coverUrl} alt="" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <span className="bg-white/20 backdrop-blur-md border border-white/30 text-white px-4 py-2 rounded-full text-[12px] font-bold uppercase tracking-wider">Change Photo</span>
                    </div>
                  </div>
                ) : (
                  <div className="w-full h-40 rounded-[14px] border border-dashed border-border bg-surface flex flex-col items-center justify-center gap-3 hover:border-text1 transition-all group-active:scale-[0.98]">
                    {uploading ? (
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 size={24} className="animate-spin text-coral" />
                        <span className="text-text3 text-[11px] font-mono uppercase tracking-widest">Uploading...</span>
                      </div>
                    ) : (
                      <>
                        <div className="w-12 h-12 rounded-2xl bg-bg/50 border border-white/[0.05] flex items-center justify-center text-text3 group-hover:text-coral transition-colors">
                          <Upload size={24} />
                        </div>
                        <span className="text-text3 text-[12px] font-bold uppercase tracking-widest">Add a cover photo</span>
                      </>
                    )}
                  </div>
                )}
              </label>
            </div>

            <Input
              label="What is the group name?"
              placeholder="e.g. Versova Tennis Club"
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={80}
              className="text-[18px] h-14"
            />

            <div>
              <div className="text-[10px] font-bold text-text3 tracking-[2px] uppercase font-mono mb-4 ml-1 flex items-center gap-2">
                Category <Sparkles size={10} />
              </div>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map(c => {
                  const selected = category === c.label
                  return (
                    <button
                      key={c.label}
                      onClick={() => setCategory(c.label)}
                    className={`px-4 py-2 rounded-[8px] text-[12px] font-bold border transition-all active:scale-95 ${
                        selected ? 'bg-text1 border-text1 text-bg' : 'premium-inset text-text2 hover:text-text1'
                      }`}
                    >
                      {c.emoji} {c.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <div className="text-[10px] font-bold text-text3 tracking-[2px] uppercase font-mono mb-4 ml-1">Visibility</div>
              <div className="grid grid-cols-2 gap-3">
                {(['open', 'private'] as const).map(option => (
                  <button
                    key={option}
                    onClick={() => setType(option)}
                    className={`flex flex-col items-center justify-center gap-3 p-5 rounded-[12px] border transition-all active:scale-[.98] ${
                      type === option ? 'premium-card border-coral/40 text-coral' : 'premium-inset text-text3'
                    }`}
                  >
                    {option === 'open' ? <Unlock size={20} /> : <Lock size={20} />}
                    <span className="font-display text-[16px] font-bold uppercase tracking-widest">{option}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="premium-card p-4 rounded-[12px] flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-bg/50 flex items-center justify-center flex-shrink-0">
                <MapPin size={18} className="text-coral" />
              </div>
              <div>
                <div className="text-[10px] font-bold text-text3 tracking-[1.5px] uppercase font-mono mb-0.5">Your Pincode</div>
                <div className="text-[16px] font-mono font-black text-text1">{user?.primary_pincode ?? '000000'}</div>
              </div>
            </div>

            <div>
              <div className="text-[10px] font-bold text-text3 tracking-[2px] uppercase font-mono mb-3 ml-1">About the group</div>
              <textarea
                value={desc}
                onChange={e => setDesc(e.target.value)}
                maxLength={400}
                rows={4}
                placeholder="Tell people what this group is for..."
                className="w-full premium-card rounded-[14px] px-5 py-4 text-text1 text-[15px] font-body outline-none resize-none focus:border-text1 transition-all placeholder:text-text3/70"
              />
            </div>

            <Button onClick={handleCreateGroup} loading={loading} disabled={!name.trim()} className="h-14 rounded-[10px]">
              Create Community
            </Button>
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
