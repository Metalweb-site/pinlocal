'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import {
  castGroupAdminVote,
  getGroup,
  getGroupAdminVotes,
  getMessages,
  getThreads,
  startGroupAdminVote,
} from '@/lib/api'
import { Group, GroupAdminVote, Message, Thread } from '@/types'
import { useChatStore } from '@/store/chat.store'
import { useAuthStore } from '@/store/auth.store'
import { useSocket } from '@/hooks/useSocket'
import Avatar from '@/components/shared/Avatar'
import MessageBubble from '@/components/chat/MessageBubble'
import MessageInput from '@/components/chat/MessageInput'
import { ArrowLeft, CheckCircle2, Clock, Hash, Loader2, Pin, Vote } from 'lucide-react'

export default function ThreadPage() {
  const { groupId, threadId } = useParams<{ groupId: string; threadId: string }>()
  const router = useRouter()
  const socket = useSocket()
  const { user } = useAuthStore()
  const {
    messages,
    setMessages,
    prependMessages,
    setActiveThread,
    setThreads,
    markRead,
    updateMessageReactions,
    typingUsers,
  } = useChatStore()

  const [thread, setThread] = useState<Thread | null>(null)
  const [threadsList, setThreadsList] = useState<Thread[]>([])
  const [group, setGroup] = useState<Group | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [onlineCount, setOnlineCount] = useState(0)
  const [adminVotes, setAdminVotes] = useState<GroupAdminVote[]>([])
  const [voteLoading, setVoteLoading] = useState(false)

  const bottomRef = useRef<HTMLDivElement>(null)
  const topRef = useRef<HTMLDivElement>(null)
  const msgs = useMemo(() => messages[threadId] ?? [], [messages, threadId])
  const typing = useMemo(() => typingUsers[threadId] ?? [], [typingUsers, threadId])

  useEffect(() => {
    setActiveThread(threadId)
    Promise.all([getMessages(threadId), getGroup(groupId), getThreads(groupId)])
      .then(([mRes, gRes, tRes]) => {
        const nextThreads = tRes.data.threads ?? []
        setMessages(threadId, mRes.data.messages ?? [])
        setHasMore(mRes.data.hasMore ?? false)
        setGroup(gRes.data.group)
        setThreadsList(nextThreads)
        setThreads(nextThreads)
        setThread(nextThreads.find((x: Thread) => x.id === threadId) ?? null)
        markRead(threadId)
        const activeThread = nextThreads.find((x: Thread) => x.id === threadId)
        if (activeThread?.name?.toLowerCase() === 'general') {
          getGroupAdminVotes(groupId)
            .then(res => setAdminVotes(res.data.votes ?? []))
            .catch(() => setAdminVotes([]))
        }
      })
      .catch(() => router.back())
      .finally(() => setLoading(false))
  }, [threadId, groupId, router, setActiveThread, setMessages, setThreads, markRead])

  useEffect(() => {
    socket.emit('join_thread', { thread_id: threadId })
    socket.on('room_online', ({ count }: { count: number }) => setOnlineCount(count))
    return () => {
      socket.emit('leave_thread', { thread_id: threadId })
      socket.off('room_online')
    }
  }, [threadId, socket])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs.length, adminVotes.length])

  useEffect(() => {
    socket.emit('mark_read', { thread_id: threadId, message_id: msgs[msgs.length - 1]?.id })
    markRead(threadId)
    window.dispatchEvent(new Event('pinlocal:badges-refresh'))
  }, [msgs, msgs.length, socket, threadId, markRead])

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || msgs.length === 0) return
    setLoadingMore(true)
    try {
      const oldest = msgs[0]?.id
      const res = await getMessages(threadId, oldest)
      prependMessages(threadId, res.data.messages ?? [])
      setHasMore(res.data.hasMore ?? false)
    } catch {
    } finally {
      setLoadingMore(false)
    }
  }, [loadingMore, hasMore, msgs, threadId, prependMessages])

  useEffect(() => {
    const obs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) loadMore()
    }, { threshold: 0.1 })
    if (topRef.current) obs.observe(topRef.current)
    return () => obs.disconnect()
  }, [loadMore])

  const dateLabel = (date: string) => new Date(date).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })

  const mergeVoteUpdate = (vote: GroupAdminVote | null) => {
    if (!vote) return
    setAdminVotes(prev => {
      const existing = prev.find(item => item.id === vote.id)
      const merged = { ...vote, user_vote: vote.user_vote ?? existing?.user_vote ?? null }
      const next = existing
        ? prev.map(item => item.id === vote.id ? merged : item)
        : [...prev, merged]
      return next.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    })
  }

  const isGeneralThread = thread?.name?.toLowerCase() === 'general'
  const activeAdminVote = adminVotes.find(vote => vote.status === 'active') ?? null
  const canStartAdminVote = Boolean(isGeneralThread && group?.is_member && user?.id && user.id !== group.admin_user_id && !activeAdminVote)
  const voteActionLabel = activeAdminVote
    ? 'Main admin vote active'
    : user?.id === group?.admin_user_id
      ? 'Main admin cannot start vote'
      : 'Start main admin vote'

  const refreshVoteContext = async () => {
    const [groupRes, votesRes] = await Promise.all([getGroup(groupId), getGroupAdminVotes(groupId)])
    setGroup(groupRes.data.group)
    setAdminVotes(votesRes.data.votes ?? [])
  }

  const handleStartVote = async () => {
    setVoteLoading(true)
    try {
      const res = await startGroupAdminVote(groupId)
      mergeVoteUpdate(res.data.vote)
      toast.success('Vote started in #general')
    } catch (error: any) {
      const vote = error.response?.data?.vote
      if (vote) mergeVoteUpdate(vote)
      toast.error(error.response?.data?.message || 'Could not start vote')
    } finally {
      setVoteLoading(false)
    }
  }

  const handleVote = async (voteId: string, choice: 'yes' | 'no') => {
    setVoteLoading(true)
    try {
      const res = await castGroupAdminVote(groupId, voteId, choice)
      const vote = res.data.vote as GroupAdminVote
      mergeVoteUpdate(vote)
      if (vote.status !== 'active') await refreshVoteContext()
      toast.success(vote.status === 'active' ? 'Vote saved' : 'Vote completed')
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Could not save vote')
    } finally {
      setVoteLoading(false)
    }
  }

  useEffect(() => {
    if (!isGeneralThread) return
    const handleVoteUpdate = ({ vote }: { vote: GroupAdminVote }) => {
      if (vote.group_id !== groupId) return
      mergeVoteUpdate(vote)
      if (vote.status !== 'active') {
        getGroup(groupId).then(res => setGroup(res.data.group)).catch(() => undefined)
      }
    }
    socket.on('group_admin_vote_updated', handleVoteUpdate)
    return () => {
      socket.off('group_admin_vote_updated', handleVoteUpdate)
    }
  }, [socket, isGeneralThread, groupId])

  useEffect(() => {
    const handleReactionUpdate = ({ thread_id, message_id, reactions }: { thread_id: string; message_id: string; reactions: any[] }) => {
      updateMessageReactions(thread_id, message_id, reactions)
    }
    socket.on('message_reactions_updated', handleReactionUpdate)
    return () => {
      socket.off('message_reactions_updated', handleReactionUpdate)
    }
  }, [socket, updateMessageReactions])

  const renderVoteCard = (vote: GroupAdminVote, pinned = false) => {
    const voteInitiatorName = vote.initiator?.username || vote.initiator?.phone || 'the challenger'
    const currentAdminName = vote.current_admin?.username || vote.current_admin?.phone || 'current main admin'
    return (
      <div key={`${pinned ? 'pinned-' : ''}${vote.id}`} className={`${pinned ? '' : 'my-3'} rounded-[12px] border border-[#CFE0FF] bg-[#F7FAFF] p-4 shadow-[0_14px_34px_rgba(7,92,255,0.08)]`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Vote size={16} className="text-[#075CFF]" />
              <h3 className="text-sm font-black text-[#081234]">{pinned ? 'Pinned vote' : 'Main admin vote'}</h3>
              <span className="rounded-[6px] border border-[#D7DFF0] bg-white px-2 py-0.5 text-[10px] font-bold uppercase text-[#697391]">
                {vote.status}
              </span>
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-[#44506E]">
              {vote.status === 'active'
                ? `${voteInitiatorName} wants to become main admin. Vote yes to replace ${currentAdminName}, or no to keep the current main admin.`
                : vote.status === 'passed'
                  ? `${voteInitiatorName} won the vote and became main admin.`
                  : `${currentAdminName} stayed main admin after the vote.`}
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="grid grid-cols-3 gap-2 text-center">
            <VoteStat label="Yes" value={vote.yes_count} highlight />
            <VoteStat label="No" value={vote.no_count} />
            <VoteStat label="Members" value={vote.total_eligible} />
          </div>

          {vote.status === 'active' ? (
            <div className="flex flex-col gap-2 sm:w-[190px]">
              <div className="inline-flex items-center gap-1 text-[11px] text-[#697391]">
                <Clock size={12} />
                Ends {new Date(vote.ends_at).toLocaleString()}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleVote(vote.id, 'yes')}
                  disabled={voteLoading}
                  className={`h-9 rounded-[8px] text-xs font-black disabled:opacity-60 ${vote.user_vote === 'yes' ? 'bg-[#075CFF] text-white' : 'border border-[#D7DFF0] bg-white text-[#081234]'}`}
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => handleVote(vote.id, 'no')}
                  disabled={voteLoading}
                  className={`h-9 rounded-[8px] text-xs font-black disabled:opacity-60 ${vote.user_vote === 'no' ? 'bg-[#081234] text-white' : 'border border-[#D7DFF0] bg-white text-[#081234]'}`}
                >
                  No
                </button>
              </div>
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 rounded-[8px] border border-[#D7DFF0] bg-white px-3 py-2 text-[12px] font-bold text-[#44506E]">
              <CheckCircle2 size={14} className="text-[#075CFF]" />
              Completed {vote.resolved_at ? new Date(vote.resolved_at).toLocaleString() : ''}
            </div>
          )}
        </div>
      </div>
    )
  }

  const timelineItems = useMemo(() => {
    return [
      ...msgs.map(message => ({ type: 'message' as const, id: message.id, date: message.created_at, message })),
      ...adminVotes.map(vote => ({ type: 'vote' as const, id: vote.id, date: vote.created_at, vote })),
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  }, [msgs, adminVotes])

  const shouldShowTimelineDate = (i: number) => {
    if (i === 0) return true
    return dateLabel(timelineItems[i].date) !== dateLabel(timelineItems[i - 1].date)
  }

  return (
    <div className="flex h-screen bg-white text-[#081234]">
      <aside className="hidden w-[290px] flex-shrink-0 border-r border-[#E4E9F4] bg-white px-5 py-7 xl:block">
        <button onClick={() => router.push('/groups')} className="mb-7 flex items-center gap-2 text-[13px] font-black text-[#081234]">
          <ArrowLeft size={16} />
          Back to Groups
        </button>

        <div className="mb-7">
          <Avatar name={group?.name} src={group?.cover_image_url} size={80} className="!rounded-full" />
          <h1 className="mt-5 text-[21px] font-black tracking-[-0.03em]">{group?.name ?? 'Group'}</h1>
          <p className="mt-2 text-[13px] font-semibold text-[#44506E]">
            {group?.type === 'open' ? 'Open Group' : 'Private Group'} <span className="mx-1.5">•</span> {group?.member_count ?? 0} members
          </p>
          <p className="mt-2 flex items-center gap-2 text-[12px] font-semibold text-[#44506E]">
            <span className="h-2 w-2 rounded-full bg-[#16B84E]" />
            {onlineCount > 0 ? `${onlineCount} online` : 'Live'}
          </p>
        </div>

        <nav className="space-y-2">
          {threadsList.map(t => {
            const active = t.id === threadId
            return (
              <Link
                key={t.id}
                href={`/groups/${groupId}/threads/${t.id}`}
                className={`flex h-11 items-center gap-3 rounded-[8px] px-3 text-[13px] font-bold transition-colors ${
                  active ? 'bg-[#F1F5FF] text-[#075CFF]' : 'text-[#172143] hover:bg-[#F7FAFF] hover:text-[#075CFF]'
                }`}
              >
                <Hash size={18} strokeWidth={2.6} />
                <span className="min-w-0 flex-1 truncate">{t.name}</span>
                {(t.unread_count ?? 0) > 0 && (
                  <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#075CFF] px-1 text-[11px] text-white">
                    {t.unread_count}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col bg-white">
        <header className="flex h-[64px] flex-shrink-0 items-center gap-4 border-b border-[#E4E9F4] bg-white px-5 xl:px-8">
          <button onClick={() => router.push('/groups')}
            className="grid h-9 w-9 place-items-center rounded-full border border-[#E4E9F4] bg-white text-[#081234] active:scale-95 xl:hidden">
            <ArrowLeft size={16} strokeWidth={2.5} />
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <Hash size={25} className="text-[#075CFF]" strokeWidth={2.6} />
            <div className="min-w-0">
              <h2 className="truncate text-[20px] font-black tracking-[-0.02em]">{thread?.name ?? 'General'}</h2>
              <p className="truncate text-[11px] font-semibold text-[#697391] xl:hidden">{group?.name} • {group?.member_count ?? 0} members</p>
            </div>
          </div>
        </header>

        {activeAdminVote ? (
          <div className="border-b border-[#E4E9F4] bg-white px-4 py-3 xl:px-8">
            {renderVoteCard(activeAdminVote, true)}
          </div>
        ) : (
          <div className="mx-4 mt-4 rounded-[12px] border border-[#CFE0FF] bg-[#F7FAFF] p-4 shadow-[0_14px_34px_rgba(7,92,255,0.06)] xl:mx-8">
            <div className="flex items-start gap-3">
              <Pin size={16} className="mt-0.5 text-[#075CFF]" />
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-semibold text-[#44506E]">Pinned by admin</p>
                <h3 className="mt-2 text-[15px] font-black text-[#081234]">Welcome to #{thread?.name ?? 'general'}</h3>
                <p className="mt-1 text-[13px] font-semibold leading-relaxed text-[#44506E]">
                  Keep the conversation useful for everyone in {group?.name ?? 'this group'}.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 py-4 xl:px-8">
          <div ref={topRef}>
            {loadingMore && (
              <div className="flex justify-center py-2">
                <Loader2 size={16} className="animate-spin text-[#697391]" />
              </div>
            )}
            {!hasMore && msgs.length > 0 && (
              <p className="py-2 text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8B96B2]">
                Beginning of #{thread?.name}
              </p>
            )}
          </div>

          {loading ? (
            <div className="flex justify-center pt-12">
              <Loader2 size={24} className="animate-spin text-[#075CFF]" />
            </div>
          ) : timelineItems.length === 0 ? (
            <div className="flex min-h-[45vh] flex-col items-center justify-center text-center">
              <Hash size={36} className="mb-3 text-[#8B96B2]" />
              <p className="text-[14px] font-semibold text-[#697391]">No messages yet. Say something!</p>
            </div>
          ) : (
            timelineItems.map((item, i) => (
              <div key={`${item.type}-${item.id}`}>
                {shouldShowTimelineDate(i) && (
                  <div className="my-4 flex items-center gap-3">
                    <div className="h-px flex-1 bg-[#E4E9F4]" />
                    <span className="rounded-full border border-[#E4E9F4] bg-white px-4 py-2 text-[11px] font-bold text-[#44506E]">
                      {dateLabel(item.date) === dateLabel(new Date().toISOString()) ? 'Today' : dateLabel(item.date)}
                    </span>
                    <div className="h-px flex-1 bg-[#E4E9F4]" />
                  </div>
                )}
                {item.type === 'vote' ? (
                  renderVoteCard(item.vote)
                ) : (
                  <MessageBubble
                    message={item.message}
                    isOwn={item.message.sender_id === user?.id}
                    currentUser={user}
                    onReply={setReplyTo}
                  />
                )}
              </div>
            ))
          )}

          {typing.length > 0 && (
            <div className="mt-3 flex items-center gap-2 text-[11px] font-semibold text-[#697391]">
              <div className="flex gap-1">
                {[0, 1, 2].map(i => (
                  <div key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#075CFF]" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
              <span>{typing.join(', ')} {typing.length === 1 ? 'is' : 'are'} typing...</span>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        <MessageInput
          threadId={threadId}
          threadName={thread?.name ?? 'General'}
          replyTo={replyTo}
          onClearReply={() => setReplyTo(null)}
          extraActions={isGeneralThread ? [{
            label: voteActionLabel,
            icon: <Vote size={14} className="text-[#075CFF]" />,
            onClick: handleStartVote,
            disabled: voteLoading || !canStartAdminVote,
          }] : []}
        />
      </section>
    </div>
  )
}

function VoteStat({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="rounded-[10px] border border-[#D7DFF0] bg-white p-2">
      <p className={`text-lg font-black ${highlight ? 'text-[#075CFF]' : 'text-[#081234]'}`}>{value}</p>
      <p className="text-[10px] font-bold uppercase text-[#697391]">{label}</p>
    </div>
  )
}
