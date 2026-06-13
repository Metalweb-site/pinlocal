'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Loader2, MapPin, MessageCircle, Search, Send, Smile, UserPlus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { getPersonalChats, getPersonalMessages, markPersonalChatRead, searchChatUsers, sendPersonalMessage, startPersonalChat } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { useSocket } from '@/hooks/useSocket'
import Avatar from '@/components/shared/Avatar'
import NotificationBell from '@/components/shared/NotificationBell'
import EmojiPicker from '@/components/chat/EmojiPicker'
import { useClickOutside } from '@/hooks/useClickOutside'
import { PersonalConversation, PersonalMessage, User } from '@/types'
import { timeAgo } from '@/lib/utils'
import toast from 'react-hot-toast'

type SearchUser = Pick<User, 'id' | 'phone' | 'username' | 'avatar_url' | 'primary_pincode'>

export default function ChatsPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const socket = useSocket()
  const [conversations, setConversations] = useState<PersonalConversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Record<string, PersonalMessage[]>>({})
  const [loading, setLoading] = useState(true)
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [draft, setDraft] = useState('')
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<SearchUser[]>([])
  const [sending, setSending] = useState(false)
  const [showEmoji, setShowEmoji] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const draftRef = useRef<HTMLInputElement>(null)
  const emojiRef = useRef<HTMLDivElement>(null)

  useClickOutside(emojiRef, () => setShowEmoji(false), showEmoji)

  useEffect(() => {
    if (authLoading) return
    getPersonalChats()
      .then(res => {
        const list = res.data.conversations ?? []
        setConversations(list)
        setActiveId(list[0]?.id ?? null)
      })
      .catch(() => toast.error('Could not load chats'))
      .finally(() => setLoading(false))
  }, [authLoading])

  useEffect(() => {
    if (!activeId || messages[activeId]) return
    setMessagesLoading(true)
    getPersonalMessages(activeId)
      .then(res => {
        setMessages(prev => ({ ...prev, [activeId]: res.data.messages ?? [] }))
        return markPersonalChatRead(activeId)
      })
      .then(() => window.dispatchEvent(new Event('pinlocal:badges-refresh')))
      .catch(() => toast.error('Could not load messages'))
      .finally(() => setMessagesLoading(false))
  }, [activeId, messages])

  useEffect(() => {
    if (!activeId) return
    markPersonalChatRead(activeId)
      .then(() => window.dispatchEvent(new Event('pinlocal:badges-refresh')))
      .catch(() => undefined)
  }, [activeId])

  useEffect(() => {
    const q = search.trim()
    if (q.length < 2) {
      setResults([])
      return
    }
    const timer = window.setTimeout(() => {
      searchChatUsers(q)
        .then(res => setResults(res.data.users ?? []))
        .catch(() => setResults([]))
    }, 250)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    if (!socket) return
    const handleMessage = ({ conversation_id, message }: { conversation_id: string; message: PersonalMessage }) => {
      setMessages(prev => {
        const existing = prev[conversation_id] ?? []
        if (existing.some(m => m.id === message.id)) return prev
        return { ...prev, [conversation_id]: [...existing, message].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) }
      })
      setConversations(prev => prev.map(c => c.id === conversation_id ? { ...c, last_message: message, updated_at: message.created_at } : c).sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()))
      if (conversation_id === activeId) {
        markPersonalChatRead(conversation_id)
          .then(() => window.dispatchEvent(new Event('pinlocal:badges-refresh')))
          .catch(() => undefined)
      }
    }
    socket.on('personal_message_created', handleMessage)
    return () => {
      socket.off('personal_message_created', handleMessage)
    }
  }, [socket, activeId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeId, messages])

  const activeConversation = conversations.find(c => c.id === activeId) ?? null
  const activeMessages = activeId ? messages[activeId] ?? [] : []
  const userName = user?.username ?? 'Resident'
  const pincode = user?.primary_pincode ?? '400001'

  const openUserProfile = (userId?: string, event?: React.MouseEvent) => {
    event?.stopPropagation()
    if (!userId) return
    if (userId === user?.id) router.push('/profile')
    else router.push(`/users/${userId}`)
  }

  const startChat = async (target: SearchUser) => {
    try {
      const res = await startPersonalChat({ user_id: target.id })
      const conversation = res.data.conversation as PersonalConversation
      setConversations(prev => [conversation, ...prev.filter(c => c.id !== conversation.id)])
      setActiveId(conversation.id)
      setSearch('')
      setResults([])
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? 'Could not start chat')
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const content = draft.trim()
    if (!activeId || !content || sending) return
    setSending(true)
    try {
      const res = await sendPersonalMessage(activeId, { content })
      const message = res.data.message as PersonalMessage
      setMessages(prev => {
        const existing = prev[activeId] ?? []
        if (existing.some(m => m.id === message.id)) return prev
        return { ...prev, [activeId]: [...existing, message] }
      })
      setConversations(prev => prev.map(c => c.id === activeId ? { ...c, last_message: message, updated_at: message.created_at } : c))
      setDraft('')
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? 'Could not send message')
    } finally {
      setSending(false)
    }
  }

  const insertEmoji = (emoji: string) => {
    const input = draftRef.current
    if (!input) {
      setDraft(prev => `${prev}${emoji}`)
      return
    }
    const start = input.selectionStart ?? draft.length
    const end = input.selectionEnd ?? draft.length
    const next = `${draft.slice(0, start)}${emoji}${draft.slice(end)}`
    setDraft(next)
    window.requestAnimationFrame(() => {
      input.focus()
      const cursor = start + emoji.length
      input.setSelectionRange(cursor, cursor)
    })
  }

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#FBFCFF]">
        <Loader2 size={28} className="animate-spin text-[#075CFF]" />
        <p className="mt-4 text-[12px] font-semibold text-[#697391]">Loading chats</p>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-white text-[#081234]">
      <aside className="w-full flex-shrink-0 border-r border-[#E4E9F4] bg-white px-5 py-6 md:w-[360px]">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-[30px] font-black tracking-[-0.045em]">Chats</h1>
            <p className="mt-1 text-[13px] font-semibold text-[#697391]">Personal conversations</p>
          </div>
          <NotificationBell className="border border-[#D7DFF0] bg-white" iconSize={19} />
        </div>

        <div className="relative mb-5">
          <div className="flex h-11 items-center rounded-[9px] border border-[#D7DFF0] bg-white px-3 shadow-[0_10px_30px_rgba(40,70,120,0.04)]">
            <Search size={18} className="mr-2 text-[#697391]" />
            <input value={search} onChange={e => setSearch(e.target.value)} className="min-w-0 flex-1 bg-transparent text-[13px] font-semibold outline-none placeholder:text-[#8B96B2]" placeholder="Search users by name, phone, pincode" />
          </div>
          {results.length > 0 && (
            <div className="absolute left-0 right-0 top-12 z-20 overflow-hidden rounded-[10px] border border-[#DDE5F3] bg-white shadow-2xl">
              {results.map(result => (
                <button key={result.id} onClick={() => startChat(result)} className="flex w-full items-center gap-3 border-b border-[#EDF1F8] p-3 text-left last:border-b-0 hover:bg-[#F7FAFF]">
                  <span onClick={(event) => openUserProfile(result.id, event)} className="rounded-full focus:outline-none focus:ring-2 focus:ring-[#075CFF]" role="button" tabIndex={0}>
                    <Avatar name={result.username ?? result.phone} src={result.avatar_url} size={38} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-black">{result.username ?? result.phone}</p>
                    <p className="text-[12px] font-semibold text-[#697391]">{result.primary_pincode}</p>
                  </div>
                  <UserPlus size={17} className="text-[#075CFF]" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2 overflow-y-auto pb-6">
          {conversations.length === 0 ? (
            <div className="rounded-[12px] border border-dashed border-[#D7DFF0] bg-[#F8FAFF] p-8 text-center">
              <MessageCircle size={28} className="mx-auto text-[#075CFF]" />
              <h2 className="mt-4 text-[18px] font-black">No personal chats yet</h2>
              <p className="mt-2 text-[13px] font-semibold leading-relaxed text-[#697391]">Search a user above to start a private conversation.</p>
            </div>
          ) : conversations.map(conversation => {
            const other = conversation.other_user
            const active = conversation.id === activeId
            return (
              <div key={conversation.id} onClick={() => setActiveId(conversation.id)} className={`flex w-full cursor-pointer items-center gap-3 rounded-[10px] p-3 text-left transition-all ${active ? 'bg-[#EEF4FF]' : 'hover:bg-[#F7FAFF]'}`}>
                <button type="button" onClick={(event) => openUserProfile(other?.id, event)} className="rounded-full focus:outline-none focus:ring-2 focus:ring-[#075CFF]" aria-label="Open user profile">
                  <Avatar name={other?.username ?? other?.phone ?? 'User'} src={other?.avatar_url} size={46} />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <button type="button" onClick={(event) => openUserProfile(other?.id, event)} className="min-w-0 truncate text-left text-[14px] font-black hover:text-[#075CFF]">{other?.username ?? other?.phone ?? 'User'}</button>
                    <span className="text-[11px] font-semibold text-[#697391]">{conversation.last_message ? timeAgo(conversation.last_message.created_at) : ''}</span>
                  </div>
                  <p className="mt-1 truncate text-[12px] font-semibold text-[#697391]">{conversation.last_message?.content ?? 'No messages yet'}</p>
                </div>
              </div>
            )
          })}
        </div>
      </aside>

      <section className="hidden min-w-0 flex-1 flex-col md:flex">
        {activeConversation ? (
          <>
            <header className="flex h-[72px] flex-shrink-0 items-center justify-between border-b border-[#E4E9F4] bg-white px-6">
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => openUserProfile(activeConversation.other_user?.id)} className="rounded-full focus:outline-none focus:ring-2 focus:ring-[#075CFF]" aria-label="Open user profile">
                  <Avatar name={activeConversation.other_user?.username ?? activeConversation.other_user?.phone ?? 'User'} src={activeConversation.other_user?.avatar_url} size={42} />
                </button>
                <div>
                  <button type="button" onClick={() => openUserProfile(activeConversation.other_user?.id)} className="text-left text-[17px] font-black hover:text-[#075CFF]">{activeConversation.other_user?.username ?? activeConversation.other_user?.phone ?? 'User'}</button>
                  <p className="flex items-center gap-1 text-[12px] font-semibold text-[#697391]"><MapPin size={13} /> {activeConversation.other_user?.primary_pincode ?? pincode}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-[13px] font-black text-[#697391]">
                {userName}
                <ChevronDown size={16} />
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto bg-[#FBFCFF] px-6 py-6">
              {messagesLoading ? (
                <div className="flex h-full items-center justify-center"><Loader2 size={24} className="animate-spin text-[#075CFF]" /></div>
              ) : activeMessages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <MessageCircle size={34} className="text-[#075CFF]" />
                  <h2 className="mt-4 text-[22px] font-black">Start the conversation</h2>
                  <p className="mt-2 text-[13px] font-semibold text-[#697391]">This is a private chat between you two.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {activeMessages.map(message => {
                    const mine = message.sender_id === user?.id
                    return (
                      <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[68%] rounded-[14px] px-4 py-2.5 shadow-[0_10px_26px_rgba(30,56,104,0.08)] ${mine ? 'rounded-br-[4px] bg-[#075CFF] text-white' : 'rounded-bl-[4px] border border-[#DDE5F3] bg-white text-[#081234]'}`}>
                          <p className="whitespace-pre-wrap text-[14px] font-semibold leading-relaxed">{message.is_deleted ? 'This message was deleted' : message.content}</p>
                          <p className={`mt-1 text-right text-[10px] font-bold ${mine ? 'text-white/70' : 'text-[#8B96B2]'}`}>{timeAgo(message.created_at)}</p>
                        </div>
                      </div>
                    )
                  })}
                  <div ref={bottomRef} />
                </div>
              )}
            </div>

            <form onSubmit={submit} className="flex flex-shrink-0 gap-3 border-t border-[#E4E9F4] bg-white p-4">
              <div ref={emojiRef} className="relative flex min-w-0 flex-1 items-center rounded-[12px] border border-[#D7DFF0] bg-white px-3 focus-within:border-[#075CFF]">
                <input
                  ref={draftRef}
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  className="h-12 min-w-0 flex-1 bg-transparent px-1 text-[14px] font-semibold outline-none"
                  placeholder="Message"
                  maxLength={3000}
                />
                {showEmoji && (
                  <div className="absolute bottom-14 right-2 z-20">
                    <EmojiPicker onSelect={insertEmoji} />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setShowEmoji(prev => !prev)}
                  className="grid h-9 w-9 place-items-center rounded-full text-[#697391] transition-colors hover:bg-[#F1F5FF] hover:text-[#075CFF]"
                  aria-label="Add emoji"
                >
                  <Smile size={18} />
                </button>
              </div>
              <button disabled={sending || draft.trim().length === 0} className="grid h-12 w-12 place-items-center rounded-[12px] bg-[#075CFF] text-white disabled:opacity-50">
                {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              </button>
            </form>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center bg-[#FBFCFF] text-center">
            <MessageCircle size={40} className="text-[#075CFF]" />
            <h2 className="mt-4 text-[26px] font-black">Select a chat</h2>
            <p className="mt-2 text-[14px] font-semibold text-[#697391]">Your personal chats appear in the side panel.</p>
          </div>
        )}
      </section>
    </div>
  )
}
