'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowRight,
  Bookmark,
  CalendarDays,
  ChevronRight,
  Clock3,
  Copy,
  Flag,
  Heart,
  Loader2,
  MapPin,
  MessageCircle,
  Send,
  Share2,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import Avatar from '@/components/shared/Avatar'
import { Group, PersonalConversation, Post, PostComment, getCategoryColor } from '@/types'
import { createComment, deletePost, getMyGroups, getPersonalChats, getPostComments, joinGroup, likePost, reportContent, savePost, sendMessage, sendPersonalMessage, sharePost } from '@/lib/api'
import { useFeedStore } from '@/store/feed.store'
import { useAuth } from '@/hooks/useAuth'
import { useSwipe } from '@/hooks/useSwipe'
import { cn, formatCount, timeAgo } from '@/lib/utils'
import { isVideoUrl } from '@/lib/media'
import toast from 'react-hot-toast'

interface FeedCardProps {
  post: Post
}

export default function FeedCard({ post }: FeedCardProps) {
  const { user } = useAuth(false)
  const router = useRouter()
  const updatePost = useFeedStore(s => s.updatePost)
  const removePost = useFeedStore(s => s.removePost)
  const [joining, setJoining] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [commenting, setCommenting] = useState(false)
  const [comments, setComments] = useState<PostComment[]>([])
  const [commentText, setCommentText] = useState('')
  const [likeCount, setLikeCount] = useState(post.like_count)
  const [liked, setLiked] = useState(Boolean(post.is_liked))
  const [commentCount, setCommentCount] = useState(post.comment_count)
  const [shareCount, setShareCount] = useState(post.share_count ?? 0)
  const [saved, setSaved] = useState(Boolean(post.is_saved))
  const [shareOpen, setShareOpen] = useState(false)
  const [shareLoading, setShareLoading] = useState(false)
  const [shareBusy, setShareBusy] = useState<string | null>(null)
  const [shareGroups, setShareGroups] = useState<Group[]>([])
  const [shareChats, setShareChats] = useState<PersonalConversation[]>([])
  const [gone, setGone] = useState(false)
  const cat = post.category ?? post.group?.category ?? 'General'
  const color = getCategoryColor(cat)
  const canDelete = user?.id === post.author_user_id || ['admin', 'moderator'].includes(post.viewer_role ?? '')
  const media = post.media_urls?.[0]
  const eventMeta = cat === 'Events' ? parseEventPost(post.content_text) : null
  const isPersonalPost = Boolean(post.is_personal_post)

  useEffect(() => {
    setLikeCount(post.like_count)
    setLiked(Boolean(post.is_liked))
    setCommentCount(post.comment_count)
    setShareCount(post.share_count ?? 0)
    setSaved(Boolean(post.is_saved))
  }, [post.like_count, post.is_liked, post.comment_count, post.share_count, post.is_saved])

  const handleJoin = async () => {
    if (isPersonalPost) return
    if (joining) return
    const threadId = post.group?.default_thread_id
    if (post.is_member) {
      if (threadId) router.push(`/groups/${post.group_id}/threads/${threadId}`)
      else toast.error('No chat thread found for this group')
      return
    }

    setJoining(true)
    try {
      const res = await joinGroup(post.group_id, { post_id: post.id })
      const { status } = res.data
      if (status === 'joined') {
        setGone(true)
        toast.success(`Joined ${post.group?.name ?? 'group'}`)
        setTimeout(() => {
          removePost(post.id)
          if (threadId) router.push(`/groups/${post.group_id}/threads/${threadId}`)
          else router.push('/groups')
        }, 420)
      } else {
        toast.success('Join request sent')
        updatePost(post.id, { is_member: true })
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Something went wrong')
    } finally {
      setJoining(false)
    }
  }

  const { dragX, progress, handlers } = useSwipe({ onSwipeRight: handleJoin })
  const swipeProgress = isPersonalPost ? 0 : progress

  const handleLike = async (e: React.MouseEvent) => {
    e.stopPropagation()
    const nextLiked = !liked
    const nextCount = Math.max(0, likeCount + (nextLiked ? 1 : -1))
    setLiked(nextLiked)
    setLikeCount(nextCount)
    updatePost(post.id, { is_liked: nextLiked, like_count: nextCount })

    try {
      const res = await likePost(post.id)
      setLiked(res.data.liked)
      setLikeCount(res.data.like_count)
      updatePost(post.id, { is_liked: res.data.liked, like_count: res.data.like_count })
    } catch {
      setLiked(liked)
      setLikeCount(likeCount)
      updatePost(post.id, { is_liked: liked, like_count: likeCount })
    }
  }

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (deleting) return
    if (!window.confirm('Delete this post?')) return

    setDeleting(true)
    try {
      await deletePost(post.id)
      setGone(true)
      toast.success('Post deleted')
      setTimeout(() => removePost(post.id), 180)
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? 'Could not delete post')
      setDeleting(false)
    }
  }

  const handleSave = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const nextSaved = !saved
    setSaved(nextSaved)
    updatePost(post.id, { is_saved: nextSaved })
    try {
      const res = await savePost(post.id)
      setSaved(res.data.saved)
      updatePost(post.id, { is_saved: res.data.saved })
      toast.success(res.data.saved ? 'Post saved' : 'Post removed from saved')
    } catch (error: any) {
      setSaved(saved)
      updatePost(post.id, { is_saved: saved })
      toast.error(error?.response?.data?.message ?? 'Could not save post')
    }
  }

  const report = async (contentType: string, contentId: string) => {
    const description = window.prompt('Tell us what is wrong. Super admins will review it.')
    if (!description?.trim()) return
    try {
      await reportContent({ content_type: contentType, content_id: contentId, reason: 'user_report', description: description.trim() })
      toast.success('Report sent to admins')
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? 'Could not send report')
    }
  }

  const openComments = async (e?: React.MouseEvent) => {
    e?.preventDefault()
    e?.stopPropagation()
    setCommentsOpen(true)
    if (comments.length > 0) return

    setCommentsLoading(true)
    try {
      const res = await getPostComments(post.id)
      setComments(res.data.comments ?? [])
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? 'Could not load comments')
    } finally {
      setCommentsLoading(false)
    }
  }

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault()
    const content = commentText.trim()
    if (!content || commenting) return

    setCommenting(true)
    try {
      const res = await createComment(post.id, content)
      const created = res.data.comment as PostComment
      setComments(prev => [...prev, created])
      setCommentText('')
      const nextCount = commentCount + 1
      setCommentCount(nextCount)
      updatePost(post.id, { comment_count: nextCount })
      toast.success('Comment posted')
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? 'Could not post comment')
    } finally {
      setCommenting(false)
    }
  }

  const postUrl = () => {
    if (typeof window === 'undefined') return ''
    return `${window.location.origin}/feed?post=${post.id}`
  }

  const shareText = () => {
    const title = headlineFromPost(post.content_text, cat)
    return `${title}\n${post.group?.name ?? 'PinLocal'} - ${post.pincode}\n${postUrl()}`
  }

  const registerShare = async () => {
    const res = await sharePost(post.id)
    const nextCount = res.data.share_count ?? shareCount + 1
    setShareCount(nextCount)
    updatePost(post.id, { share_count: nextCount })
  }

  const openShare = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setShareOpen(true)
    if (shareGroups.length > 0 || shareChats.length > 0 || shareLoading) return
    setShareLoading(true)
    try {
      const [groupsRes, chatsRes] = await Promise.all([getMyGroups(), getPersonalChats()])
      setShareGroups(groupsRes.data.groups ?? [])
      setShareChats(chatsRes.data.conversations ?? [])
    } catch {
      toast.error('Could not load share options')
    } finally {
      setShareLoading(false)
    }
  }

  const copyShareLink = async () => {
    setShareBusy('copy')
    try {
      await navigator.clipboard.writeText(postUrl())
      await registerShare()
      toast.success('Post link copied')
    } catch {
      toast.error('Could not copy link')
    } finally {
      setShareBusy(null)
    }
  }

  const nativeShare = async () => {
    if (!navigator.share) {
      await copyShareLink()
      return
    }
    setShareBusy('native')
    try {
      await navigator.share({
        title: headlineFromPost(post.content_text, cat),
        text: `${post.group?.name ?? 'PinLocal'} - ${post.pincode}`,
        url: postUrl(),
      })
      await registerShare()
    } catch {
    } finally {
      setShareBusy(null)
    }
  }

  const shareToGroup = async (group: Group) => {
    if (!group.default_thread_id) {
      toast.error('No chat thread found for this group')
      return
    }
    setShareBusy(`group-${group.id}`)
    try {
      await sendMessage(group.default_thread_id, { content: shareText() })
      await registerShare()
      toast.success(`Shared to ${group.name}`)
      setShareOpen(false)
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? 'Could not share to group')
    } finally {
      setShareBusy(null)
    }
  }

  const shareToChat = async (conversation: PersonalConversation) => {
    setShareBusy(`chat-${conversation.id}`)
    try {
      await sendPersonalMessage(conversation.id, { content: shareText() })
      await registerShare()
      toast.success(`Shared to ${conversation.other_user?.username ?? conversation.other_user?.phone ?? 'chat'}`)
      setShareOpen(false)
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? 'Could not share to chat')
    } finally {
      setShareBusy(null)
    }
  }

  const openUserProfile = (userId?: string | null, e?: React.MouseEvent) => {
    e?.preventDefault()
    e?.stopPropagation()
    if (!userId) return
    if (userId === user?.id) router.push('/profile')
    else router.push(`/users/${userId}`)
  }

  if (gone) return null

  return (
    <>
      <article
        className={cn(
          'relative ml-6 overflow-visible rounded-[12px] border border-[#DDE5F3] bg-white shadow-[0_18px_44px_rgba(30,56,104,0.07)] transition-all md:ml-0 md:pl-0',
          isPersonalPost ? 'select-none' : 'cursor-grab select-none active:cursor-grabbing',
          joining && 'opacity-70'
        )}
        style={{
          transform: isPersonalPost ? undefined : `translateX(${dragX * 0.55}px) rotate(${swipeProgress * 2.5}deg)`,
          boxShadow: swipeProgress > 0 ? `0 10px ${18 + swipeProgress * 24}px rgba(7,92,255,${swipeProgress * 0.18})` : undefined,
          transition: dragX === 0 ? 'transform .28s cubic-bezier(.34,1.56,.64,1), box-shadow .2s' : undefined,
        }}
        {...(isPersonalPost ? {} : handlers)}
      >
        <div className="absolute -left-[31px] top-9 hidden h-2.5 w-2.5 rounded-full bg-[#AAB4C8] ring-4 ring-[#FBFCFF] md:block" />

        {swipeProgress > 0 && (
          <div
            className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-[12px] pointer-events-none"
            style={{ background: `rgba(7,92,255,${swipeProgress * .88})`, opacity: swipeProgress }}
          >
            <div className="grid h-14 w-14 place-items-center rounded-full bg-white/22 text-white shadow-2xl">
              <ArrowRight size={28} strokeWidth={2.7} />
            </div>
            <span className="text-3xl font-black tracking-[-0.03em] text-white">Join</span>
          </div>
        )}

        <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_280px_106px] lg:items-center">
          <div className="min-w-0">
            <div className="flex items-start gap-4">
              <div className="relative flex-shrink-0">
                <Avatar
                  name={isPersonalPost ? post.author?.username ?? 'Resident' : post.group?.name}
                  src={isPersonalPost ? post.author?.avatar_url : post.group?.cover_image_url}
                  size={56}
                  className="!rounded-full"
                />
                <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-[#16B84E]" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-[15px] font-black text-[#081234]">{isPersonalPost ? post.author?.username ?? 'Local resident' : post.group?.name ?? 'Unknown Group'}</h2>
                  <span className="rounded-full px-2 py-1 text-[10px] font-black" style={{ background: `${color}18`, color }}>
                    {isPersonalPost ? 'Personal Post' : post.group?.type === 'private' ? 'Private Group' : cat === 'Events' ? 'Event' : 'Open Group'}
                  </span>
                </div>
                <p className="mt-2 text-[12px] font-semibold text-[#697391]">
                  {post.pincode} area <span className="mx-2">•</span> {timeAgo(post.created_at)}
                </p>
                <h3 className="mt-4 text-[16px] font-black leading-snug text-[#081234]">
                  {headlineFromPost(post.content_text, cat)}
                </h3>
                {post.content_text && (
                  <p className="mt-2 line-clamp-2 text-[14px] font-semibold leading-relaxed text-[#172143]">
                    {post.content_text}
                  </p>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  {cat === 'Events' ? (
                    <>
                      <Chip icon={CalendarDays}>{eventMeta?.dateLabel ?? 'Event date'}</Chip>
                      <Chip icon={Clock3}>{eventMeta?.timeLabel ?? 'Event time'}</Chip>
                      <Chip icon={MapPin}>{eventMeta?.venue ?? post.group?.pincode ?? post.pincode}</Chip>
                    </>
                  ) : (
                    <>
                      <span className="rounded-[6px] bg-[#EAF7E7] px-2 py-1 text-[11px] font-black text-[#2B7A2B]">#{cat}</span>
                      <span className="rounded-[6px] bg-[#EAF7E7] px-2 py-1 text-[11px] font-black text-[#2B7A2B]">#Local</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="relative h-[160px] overflow-hidden rounded-[8px] bg-[#F1F5FF] lg:h-[158px]">
            {media ? (
              isVideoUrl(media) ? (
                <video src={media} className="h-full w-full object-cover" controls autoPlay loop muted preload="metadata" playsInline />
              ) : (
                <img src={media} alt="" className="h-full w-full object-cover" loading="lazy" />
              )
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_top_left,#DDE8FF,transparent_35%),linear-gradient(135deg,#F7FAFF,#EAF0FC)]">
                <div className="text-center">
                  <Users size={34} className="mx-auto text-[#075CFF]" />
                  <p className="mt-2 text-[12px] font-black text-[#697391]">Community post</p>
                </div>
              </div>
            )}
            {cat === 'Events' && (
              <div className="absolute bottom-3 left-3 grid h-[62px] w-[62px] place-items-center rounded-full bg-white shadow-[0_12px_28px_rgba(8,18,52,0.18)]">
                <div className="text-center leading-none">
                  <p className="text-[10px] font-black text-[#697391]">{eventMeta?.month ?? 'EVT'}</p>
                  <p className="mt-1 text-[21px] font-black text-[#081234]">{eventMeta?.day ?? '--'}</p>
                  <p className="mt-0.5 text-[9px] font-black text-[#697391]">{eventMeta?.weekday ?? 'DATE'}</p>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-[#E4E9F4] pt-4 lg:block lg:border-t-0 lg:pt-0">
            <div className="grid grid-cols-3 gap-2 lg:block lg:space-y-4">
              <StatButton onClick={handleLike} active={liked} icon={<Heart size={17} fill={liked ? '#F04438' : 'none'} />}>{formatCount(likeCount)}</StatButton>
              <StatButton onClick={openComments} icon={<MessageCircle size={17} />}>{formatCount(commentCount)}</StatButton>
              <StatButton onClick={openShare} icon={<Share2 size={17} />}>{formatCount(shareCount)}</StatButton>
            </div>

            <div className="flex items-center gap-4 lg:mt-6 lg:block">
              {!isPersonalPost && <p className="hidden text-[12px] font-semibold text-[#697391] lg:block">{formatCount(post.swipe_count ?? 0)} swipes</p>}
              {!isPersonalPost && (post.latest_swipers?.length ?? 0) > 0 && (
                <div className="mt-0 flex -space-x-2 lg:mt-4">
                  {post.latest_swipers?.slice(0, 3).map(swiper => (
                    <button
                      key={swiper.id}
                      type="button"
                      onClick={(e) => openUserProfile(swiper.id, e)}
                      className="rounded-full focus:outline-none focus:ring-2 focus:ring-[#075CFF]"
                      aria-label="Open user profile"
                    >
                      <Avatar
                        name={swiper.username ?? 'User'}
                        src={swiper.avatar_url}
                        size={22}
                        className="border-2 border-white"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="ml-auto flex items-center gap-2 lg:ml-0 lg:mt-5">
              {canDelete && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="grid h-9 w-9 place-items-center rounded-full border border-[#E1E7F3] bg-white text-[#697391] transition-colors hover:border-red-200 hover:text-red-500 disabled:opacity-60"
                  aria-label="Delete post"
                >
                  {deleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                </button>
              )}
              <button
                type="button"
                onClick={handleSave}
                className={cn(
                  'grid h-9 w-9 place-items-center rounded-full border transition-colors',
                  saved
                    ? 'border-[#C9D6FF] bg-[#F1F5FF] text-[#075CFF]'
                    : 'border-[#E1E7F3] bg-white text-[#697391] hover:border-[#C9D6FF] hover:text-[#075CFF]'
                )}
                aria-label={saved ? 'Unsave post' : 'Save post'}
              >
                <Bookmark size={15} fill={saved ? '#075CFF' : 'none'} />
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); report('post', post.id) }}
                className="grid h-9 w-9 place-items-center rounded-full border border-[#E1E7F3] bg-white text-[#697391] transition-colors hover:border-amber-200 hover:text-amber-500"
                aria-label="Report post"
              >
                <Flag size={15} />
              </button>
              {!isPersonalPost && (
                <button
                  onClick={handleJoin}
                  className="grid h-9 w-9 place-items-center rounded-full text-[#697391] transition-colors hover:bg-[#F1F5FF] hover:text-[#075CFF]"
                  aria-label={post.is_member ? 'Open group' : 'Swipe to join'}
                >
                  <ChevronRight size={23} strokeWidth={2.2} />
                </button>
              )}
            </div>
          </div>
        </div>
      </article>

      {commentsOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#081234]/55 px-4 py-6 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-lg overflow-hidden rounded-[14px] border border-[#E1E7F3] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#E4E9F4] p-4">
              <div>
                <h2 className="text-xl font-black leading-none text-[#081234]">Comments</h2>
                <p className="mt-1 text-[12px] font-semibold text-[#697391]">{post.group?.name ?? 'Post'} - {post.pincode}</p>
              </div>
              <button
                type="button"
                onClick={() => setCommentsOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-full bg-[#F1F5FF] text-[#697391] hover:text-[#081234]"
                aria-label="Close comments"
              >
                <X size={16} />
              </button>
            </div>

            <div className="max-h-[52vh] min-h-[180px] overflow-y-auto p-4">
              {commentsLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 size={22} className="animate-spin text-[#075CFF]" />
                </div>
              ) : comments.length === 0 ? (
                <div className="flex min-h-[140px] flex-col items-center justify-center text-center">
                  <MessageCircle size={24} className="mb-3 text-[#8B96B2]" />
                  <p className="text-sm font-bold text-[#172143]">No comments yet</p>
                  <p className="mt-1 text-[12px] font-semibold text-[#697391]">Start the conversation for this pincode.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {comments.map(comment => (
                    <div key={comment.id} className="rounded-[10px] border border-[#E4E9F4] bg-[#F8FAFF] p-3">
                      <div className="mb-2 flex items-center gap-2">
                        <button type="button" onClick={(e) => openUserProfile(comment.user?.id, e)} className="rounded-full focus:outline-none focus:ring-2 focus:ring-[#075CFF]" aria-label="Open user profile">
                          <Avatar name={comment.user?.username ?? 'User'} src={comment.user?.avatar_url} size={26} />
                        </button>
                        <div className="min-w-0">
                          <button type="button" onClick={(e) => openUserProfile(comment.user?.id, e)} className="truncate text-left text-[13px] font-bold text-[#081234] hover:text-[#075CFF]">{comment.user?.username ?? 'Local user'}</button>
                          <p className="text-[11px] font-semibold text-[#697391]">{timeAgo(comment.created_at)}</p>
                        </div>
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#172143]">{comment.content}</p>
                      <button onClick={() => report('comment', comment.id)} className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-[#697391] hover:text-amber-600">
                        <Flag size={12} /> Report
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <form onSubmit={handleComment} className="flex gap-2 border-t border-[#E4E9F4] p-3">
              <input
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Write a comment"
                maxLength={1000}
                className="min-w-0 flex-1 rounded-[9px] border border-[#D7DFF0] bg-white px-3 py-2.5 text-sm text-[#081234] outline-none focus:border-[#075CFF]"
              />
              <button
                type="submit"
                disabled={commenting || commentText.trim().length === 0}
                className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-[9px] bg-[#075CFF] text-white transition-transform active:scale-[0.98] disabled:opacity-60"
                aria-label="Send comment"
              >
                {commenting ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}
              </button>
            </form>
          </div>
        </div>
      )}

      {shareOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#081234]/55 px-4 py-6 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-lg overflow-hidden rounded-[14px] border border-[#E1E7F3] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#E4E9F4] p-4">
              <div>
                <h2 className="text-xl font-black leading-none text-[#081234]">Share post</h2>
                <p className="mt-1 text-[12px] font-semibold text-[#697391]">{post.group?.name ?? 'Post'} - {post.pincode}</p>
              </div>
              <button
                type="button"
                onClick={() => setShareOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-full bg-[#F1F5FF] text-[#697391] hover:text-[#081234]"
                aria-label="Close share"
              >
                <X size={16} />
              </button>
            </div>

            <div className="max-h-[65vh] overflow-y-auto p-4">
              <div className="grid grid-cols-2 gap-3">
                <button onClick={nativeShare} disabled={Boolean(shareBusy)} className="flex h-12 items-center justify-center gap-2 rounded-[10px] bg-[#075CFF] text-[13px] font-black text-white disabled:opacity-60">
                  {shareBusy === 'native' ? <Loader2 size={15} className="animate-spin" /> : <Share2 size={16} />}
                  Share outside
                </button>
                <button onClick={copyShareLink} disabled={Boolean(shareBusy)} className="flex h-12 items-center justify-center gap-2 rounded-[10px] border border-[#D7DFF0] bg-white text-[13px] font-black text-[#081234] disabled:opacity-60">
                  {shareBusy === 'copy' ? <Loader2 size={15} className="animate-spin" /> : <Copy size={16} />}
                  Copy link
                </button>
              </div>

              {shareLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 size={22} className="animate-spin text-[#075CFF]" />
                </div>
              ) : (
                <div className="mt-5 grid gap-5 md:grid-cols-2">
                  <section>
                    <h3 className="mb-3 text-[13px] font-black uppercase tracking-[0.08em] text-[#697391]">Groups</h3>
                    <div className="space-y-2">
                      {shareGroups.length === 0 ? (
                        <p className="rounded-[10px] border border-dashed border-[#D7DFF0] p-4 text-center text-[12px] font-semibold text-[#697391]">No groups available</p>
                      ) : shareGroups.map(group => (
                        <button key={group.id} onClick={() => shareToGroup(group)} disabled={Boolean(shareBusy)} className="flex w-full items-center gap-3 rounded-[10px] border border-[#E4E9F4] p-3 text-left hover:bg-[#F7FAFF] disabled:opacity-60">
                          <Avatar name={group.name} src={group.cover_image_url} size={34} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-black text-[#081234]">{group.name}</p>
                            <p className="text-[11px] font-semibold text-[#697391]">{group.pincode}</p>
                          </div>
                          {shareBusy === `group-${group.id}` && <Loader2 size={15} className="animate-spin text-[#075CFF]" />}
                        </button>
                      ))}
                    </div>
                  </section>

                  <section>
                    <h3 className="mb-3 text-[13px] font-black uppercase tracking-[0.08em] text-[#697391]">Personal chats</h3>
                    <div className="space-y-2">
                      {shareChats.length === 0 ? (
                        <p className="rounded-[10px] border border-dashed border-[#D7DFF0] p-4 text-center text-[12px] font-semibold text-[#697391]">No personal chats yet</p>
                      ) : shareChats.map(chat => (
                        <button key={chat.id} onClick={() => shareToChat(chat)} disabled={Boolean(shareBusy)} className="flex w-full items-center gap-3 rounded-[10px] border border-[#E4E9F4] p-3 text-left hover:bg-[#F7FAFF] disabled:opacity-60">
                          <Avatar name={chat.other_user?.username ?? chat.other_user?.phone ?? 'User'} src={chat.other_user?.avatar_url} size={34} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-black text-[#081234]">{chat.other_user?.username ?? chat.other_user?.phone ?? 'User'}</p>
                            <p className="text-[11px] font-semibold text-[#697391]">{chat.other_user?.primary_pincode ?? 'Personal chat'}</p>
                          </div>
                          {shareBusy === `chat-${chat.id}` && <Loader2 size={15} className="animate-spin text-[#075CFF]" />}
                        </button>
                      ))}
                    </div>
                  </section>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function headlineFromPost(content: string | null, category: string) {
  if (!content?.trim()) return category === 'Events' ? 'An event is coming up nearby!' : 'New local update from this group'
  if (category === 'Events') {
    const eventTitle = content.match(/^Event:\s*(.+)$/im)?.[1]?.trim()
    if (eventTitle) return eventTitle.length <= 58 ? eventTitle : `${eventTitle.slice(0, 55).trim()}...`
  }
  const firstLine = content.trim().split(/\r?\n/)[0]
  if (firstLine.length <= 58) return firstLine
  return `${firstLine.slice(0, 55).trim()}...`
}

function parseEventPost(content: string | null) {
  const text = content ?? ''
  const dateValue = text.match(/^Date:\s*(.+)$/im)?.[1]?.trim()
  const timeValue = text.match(/^Time:\s*(.+)$/im)?.[1]?.trim()
  const venue = text.match(/^Venue:\s*(.+)$/im)?.[1]?.trim()
  const date = dateValue ? new Date(`${dateValue}T${timeValue || '00:00'}`) : null
  const validDate = date && !Number.isNaN(date.getTime())
  return {
    dateLabel: validDate ? date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', weekday: 'short' }) : dateValue,
    timeLabel: timeValue || null,
    venue,
    month: validDate ? date.toLocaleDateString('en-IN', { month: 'short' }).toUpperCase() : undefined,
    day: validDate ? date.getDate().toString().padStart(2, '0') : undefined,
    weekday: validDate ? date.toLocaleDateString('en-IN', { weekday: 'short' }).toUpperCase() : undefined,
  }
}

function Chip({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-[6px] border border-[#D7DFF0] bg-white px-2.5 py-1.5 text-[11px] font-black text-[#172143]">
      <Icon size={14} className="text-[#697391]" />
      {children}
    </span>
  )
}

function StatButton({
  children,
  icon,
  active,
  onClick,
}: {
  children: React.ReactNode
  icon: React.ReactNode
  active?: boolean
  onClick?: (e: React.MouseEvent) => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 text-[13px] font-black transition-colors',
        active ? 'text-[#F04438]' : 'text-[#081234] hover:text-[#075CFF]'
      )}
    >
      {icon}
      {children}
    </button>
  )
}
