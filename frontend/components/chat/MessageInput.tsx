'use client'

import { ReactNode, useRef, useState } from 'react'
import { ImagePlus, Plus, Send, Smile, X } from 'lucide-react'
import { getSocket } from '@/lib/socket'
import { sendMessage, uploadMedia } from '@/lib/api'
import { MEDIA_FILE_ACCEPT, validateMediaFile } from '@/lib/media'
import { Message } from '@/types'
import { useChatStore } from '@/store/chat.store'
import EmojiPicker from '@/components/chat/EmojiPicker'
import { useClickOutside } from '@/hooks/useClickOutside'
import toast from 'react-hot-toast'

interface Props {
  threadId: string
  threadName?: string
  replyTo: Message | null
  onClearReply: () => void
  extraActions?: {
    label: string
    icon?: ReactNode
    onClick: () => void
    disabled?: boolean
  }[]
}

export default function MessageInput({ threadId, threadName, replyTo, onClearReply, extraActions = [] }: Props) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [showMenu, setShowMenu] = useState(false)
  const [showEmoji, setShowEmoji] = useState(false)
  const addMessage = useChatStore(s => s.addMessage)
  const fileRef = useRef<HTMLInputElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const emojiRef = useRef<HTMLDivElement>(null)
  const typingRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useClickOutside(menuRef, () => setShowMenu(false), showMenu)
  useClickOutside(emojiRef, () => setShowEmoji(false), showEmoji)

  const handleTyping = () => {
    const s = getSocket()
    s.emit('typing', { thread_id: threadId })
    if (typingRef.current) clearTimeout(typingRef.current)
    typingRef.current = setTimeout(() => {}, 3000)
  }

  const persistMessage = async (payload: { content?: string; media_url?: string; media_asset_id?: string; reply_to_id?: string | null }) => {
    const res = await sendMessage(threadId, payload)
    addMessage(threadId, res.data.message)
    return res.data.message as Message
  }

  const handleSend = async () => {
    if (!text.trim() || sending) return
    const outgoing = text.trim()
    setSending(true)
    setText('')
    onClearReply()

    try {
      await persistMessage({
        content: outgoing,
        reply_to_id: replyTo?.id ?? null,
      })
    } catch {
      setText(outgoing)
      toast.error('Message not sent')
    } finally {
      setSending(false)
    }
  }

  const sendMediaMessage = async (mediaUrl: string, mediaAssetId?: string) => {
    await persistMessage({ content: '', media_url: mediaUrl, media_asset_id: mediaAssetId })
  }

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const validationError = validateMediaFile(file)
    if (validationError) {
      toast.error(validationError)
      e.target.value = ''
      return
    }
    setUploading(true)
    setUploadProgress(0)
    try {
      const res = await uploadMedia(file, setUploadProgress)
      await sendMediaMessage(res.data.processed_url ?? res.data.url, res.data.asset_id)
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? 'Upload failed')
    } finally {
      setUploading(false)
      setUploadProgress(0)
      e.target.value = ''
    }
  }

  const openMediaPicker = () => {
    setShowMenu(false)
    fileRef.current?.click()
  }

  const handlePlus = () => {
    setShowEmoji(false)
    if (extraActions.length === 0) {
      openMediaPicker()
      return
    }
    setShowMenu(prev => !prev)
  }

  const insertEmoji = (emoji: string) => {
    const input = inputRef.current
    if (!input) {
      setText(prev => `${prev}${emoji}`)
      return
    }
    const start = input.selectionStart ?? text.length
    const end = input.selectionEnd ?? text.length
    const next = `${text.slice(0, start)}${emoji}${text.slice(end)}`
    setText(next)
    window.requestAnimationFrame(() => {
      input.focus()
      const cursor = start + emoji.length
      input.setSelectionRange(cursor, cursor)
    })
    handleTyping()
  }

  return (
    <div className="flex-shrink-0 border-t border-[#E4E9F4] bg-white px-4 py-4 xl:px-8">
      {replyTo && (
        <div className="mb-2 flex items-center gap-2 rounded-[9px] border border-[#D7DFF0] bg-[#F7FAFF] px-3 py-2 text-[12px] font-semibold text-[#44506E]">
          <span className="flex-1 truncate">Replying to {replyTo.content}</span>
          <button onClick={onClearReply} aria-label="Clear reply"><X size={12} /></button>
        </div>
      )}

      <div className="flex items-center gap-3 rounded-[12px] border border-[#D7DFF0] bg-white px-3 py-2 shadow-[0_12px_30px_rgba(30,56,104,0.06)]">
        <div ref={menuRef} className="relative flex-shrink-0">
          {showMenu && (
            <div className="absolute bottom-12 left-0 z-20 w-52 overflow-hidden rounded-[12px] border border-[#D7DFF0] bg-white shadow-2xl">
              <button
                type="button"
                onClick={openMediaPicker}
                className="flex w-full items-center gap-2 px-3 py-3 text-left text-[12px] font-bold text-[#081234] hover:bg-[#F7FAFF]"
              >
                <ImagePlus size={14} className="text-[#075CFF]" />
                {uploading ? `Uploading ${uploadProgress}%` : 'Photo or video'}
              </button>
              {extraActions.map(action => (
                <button
                  key={action.label}
                  type="button"
                  onClick={() => {
                    setShowMenu(false)
                    action.onClick()
                  }}
                  disabled={action.disabled}
                  className="flex w-full items-center gap-2 px-3 py-3 text-left text-[12px] font-bold text-[#081234] hover:bg-[#F7FAFF] disabled:opacity-50"
                >
                  {action.icon}
                  {action.label}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={handlePlus}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-[#BFD0F2] bg-white text-[#506080] transition-all active:scale-90"
            aria-label="Add attachment"
          >
            {uploading ? (
              <div className="h-3 w-3 animate-spin rounded-full border border-[#697391] border-t-[#075CFF]" />
            ) : (
              <Plus size={18} />
            )}
          </button>
        </div>

        <input
          ref={inputRef}
          value={text}
          onChange={e => { setText(e.target.value); handleTyping() }}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
          placeholder={`Message #${threadName ?? threadId.slice(0, 6)}`}
          className="h-10 min-w-0 flex-1 bg-transparent px-2 text-[13px] font-semibold text-[#081234] outline-none placeholder:text-[#697391]"
        />

        <div ref={emojiRef} className="relative flex-shrink-0">
          {showEmoji && (
            <div className="absolute bottom-12 right-0 z-20">
              <EmojiPicker onSelect={insertEmoji} />
            </div>
          )}
          <button
            type="button"
            onClick={() => { setShowMenu(false); setShowEmoji(prev => !prev) }}
            className="grid h-10 w-10 place-items-center rounded-full text-[#697391] transition-colors hover:bg-[#F1F5FF] hover:text-[#075CFF]"
            aria-label="Add emoji"
          >
            <Smile size={18} />
          </button>
        </div>

        <button
          onClick={handleSend}
          disabled={!text.trim() || sending}
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[#075CFF] transition-all active:scale-90 disabled:opacity-40"
          aria-label="Send message"
        >
          <Send size={14} color="#fff" />
        </button>
        <input ref={fileRef} type="file" accept={MEDIA_FILE_ACCEPT} className="hidden" onChange={handleFile} />
      </div>
    </div>
  )
}
