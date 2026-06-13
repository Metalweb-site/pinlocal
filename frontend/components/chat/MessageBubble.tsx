'use client'

import { useRef, useState } from 'react'
import Avatar from '@/components/shared/Avatar'
import { Message, User } from '@/types'
import { formatTime } from '@/lib/utils'
import { Flag, Reply, Smile, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { deleteMessage, reactToMessage, reportContent } from '@/lib/api'
import { useChatStore } from '@/store/chat.store'
import EmojiPicker from '@/components/chat/EmojiPicker'
import { useClickOutside } from '@/hooks/useClickOutside'
import { isVideoUrl } from '@/lib/media'
import toast from 'react-hot-toast'

interface Props {
  message: Message
  isOwn: boolean
  currentUser: User | null
  onReply?: (msg: Message) => void
}

export default function MessageBubble({ message, isOwn, currentUser, onReply }: Props) {
  const router = useRouter()
  const [showActions, setShowActions] = useState(false)
  const [showReactions, setShowReactions] = useState(false)
  const reactionRef = useRef<HTMLDivElement>(null)
  const { deleteMessage: deleteMsgStore, updateMessageReactions } = useChatStore()
  useClickOutside(reactionRef, () => setShowReactions(false), showReactions)

  const handleDelete = async () => {
    try {
      await deleteMessage(message.id)
      deleteMsgStore(message.thread_id, message.id)
    } catch {
      toast.error('Could not delete message')
    }
  }

  const handleReport = async () => {
    const description = window.prompt('Tell us what is wrong with this message.')
    if (!description?.trim()) return
    try {
      await reportContent({ content_type: 'message', content_id: message.id, reason: 'user_report', description: description.trim() })
      toast.success('Report sent to admins')
    } catch {
      toast.error('Could not send report')
    }
  }

  const handleReaction = async (emoji: string) => {
    setShowReactions(false)
    try {
      const res = await reactToMessage(message.id, emoji)
      updateMessageReactions(message.thread_id, message.id, res.data.reactions ?? [])
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? 'Could not react')
    }
  }

  const openUserProfile = () => {
    const targetId = isOwn ? currentUser?.id : message.sender?.id
    if (!targetId) return
    if (targetId === currentUser?.id) router.push('/profile')
    else router.push(`/users/${targetId}`)
  }

  if (message.is_deleted) {
    return (
      <div className={`my-3 flex items-end gap-3 ${isOwn ? 'flex-row-reverse' : ''}`}>
        <div className="h-9 w-9 flex-shrink-0" />
        <div className="rounded-[10px] border border-[#E4E9F4] bg-[#F7FAFF] px-4 py-2 text-[12px] italic text-[#697391]">
          This message was deleted
        </div>
      </div>
    )
  }

  return (
    <div
      className={`group my-3 flex items-end gap-3 ${isOwn ? 'flex-row-reverse' : ''}`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {!isOwn ? (
        <button type="button" onClick={openUserProfile} className="relative flex-shrink-0 rounded-full focus:outline-none focus:ring-2 focus:ring-[#075CFF]" aria-label="Open user profile">
          <Avatar name={message.sender?.username} src={message.sender?.avatar_url} size={40} className="!rounded-full" />
          <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-[#16B84E]" />
        </button>
      ) : (
        <button type="button" onClick={openUserProfile} className="relative flex-shrink-0 rounded-full focus:outline-none focus:ring-2 focus:ring-[#075CFF]" aria-label="Open your profile">
          <Avatar name={currentUser?.username} src={currentUser?.avatar_url} size={40} className="!rounded-full" />
          <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-[#16B84E]" />
        </button>
      )}

      <div className={`flex max-w-[78%] flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
        <div className={`mb-1 flex items-center gap-2 px-1 ${isOwn ? 'flex-row-reverse' : ''}`}>
          {!isOwn && message.sender?.username && (
            <button type="button" onClick={openUserProfile} className="text-[13px] font-black text-[#081234] hover:text-[#075CFF]">{message.sender.username}</button>
          )}
          <span className="text-[11px] font-semibold text-[#697391]">{formatTime(message.created_at)}</span>
        </div>

        {message.reply_to && (
          <div className={`mb-1 max-w-full truncate rounded-[8px] border border-[#D7DFF0] bg-[#F7FAFF] px-3 py-1.5 text-[11px] font-semibold text-[#44506E] ${isOwn ? 'self-end' : ''}`}>
            Reply: {message.reply_to.content}
          </div>
        )}

        <div
          className={`relative break-words px-4 py-3 text-[13px] font-semibold leading-relaxed shadow-[0_10px_26px_rgba(30,56,104,0.06)] ${
            isOwn
              ? 'rounded-[12px] rounded-br-[4px] border border-[#D3E2FF] bg-[#EAF2FF] text-[#081234]'
              : 'rounded-[12px] rounded-bl-[4px] border border-[#DDE5F3] bg-white text-[#081234]'
          }`}
        >
          <span
            aria-hidden="true"
            className={`absolute bottom-0 h-3 w-3 ${
              isOwn
                ? 'right-[-5px] border-b border-r border-[#D3E2FF] bg-[#EAF2FF] [clip-path:polygon(0_0,100%_100%,0_100%)]'
                : 'left-[-5px] border-b border-l border-[#DDE5F3] bg-white [clip-path:polygon(100%_0,100%_100%,0_100%)]'
            }`}
          />
          {message.media_url && (
            isVideoUrl(message.media_url) ? (
              <video src={message.media_url} className="mb-2 max-w-[260px] rounded-[10px]" controls autoPlay loop muted preload="metadata" playsInline />
            ) : (
              <img src={message.media_url} alt="" className="mb-2 max-w-[260px] rounded-[10px]" loading="lazy" />
            )
          )}
          {message.content}
        </div>
        {(message.reactions?.length ?? 0) > 0 && (
          <div className={`mt-1 flex flex-wrap gap-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
            {message.reactions?.map(reaction => (
              <button
                key={reaction.emoji}
                type="button"
                onClick={() => handleReaction(reaction.emoji)}
                className={`rounded-full border px-2 py-0.5 text-[12px] font-bold shadow-sm ${
                  reaction.user_reacted
                    ? 'border-[#9CB9FF] bg-[#EAF2FF] text-[#075CFF]'
                    : 'border-[#E4E9F4] bg-white text-[#44506E]'
                }`}
              >
                {reaction.emoji} {reaction.count}
              </button>
            ))}
          </div>
        )}
      </div>

      {(showActions || showReactions) && (
        <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <div ref={reactionRef} className="relative">
            {showReactions && (
              <div className="absolute bottom-10 right-0 z-30">
                <EmojiPicker onSelect={handleReaction} />
              </div>
            )}
            <button onClick={() => setShowReactions(prev => !prev)} className="grid h-8 w-8 place-items-center rounded-full border border-[#E4E9F4] bg-white text-[#697391] hover:text-[#075CFF]">
              <Smile size={13} />
            </button>
          </div>
          {onReply && (
            <button onClick={() => onReply(message)} className="grid h-8 w-8 place-items-center rounded-full border border-[#E4E9F4] bg-white text-[#697391] hover:text-[#075CFF]">
              <Reply size={13} />
            </button>
          )}
          {isOwn && (
            <button onClick={handleDelete} className="grid h-8 w-8 place-items-center rounded-full border border-[#E4E9F4] bg-white text-[#697391] hover:text-red-500">
              <Trash2 size={13} />
            </button>
          )}
          <button onClick={handleReport} className="grid h-8 w-8 place-items-center rounded-full border border-[#E4E9F4] bg-white text-[#697391] hover:text-amber-600">
            <Flag size={13} />
          </button>
        </div>
      )}
    </div>
  )
}
