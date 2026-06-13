'use client'
import { useEffect, useRef } from 'react'
import { connectSocket, disconnectSocket, getSocket } from '@/lib/socket'
import { useChatStore } from '@/store/chat.store'
import { useFeedStore } from '@/store/feed.store'
import { Message } from '@/types'

export function useSocket() {
  const initialized = useRef(false)
  const { addMessage, deleteMessage, setTyping } = useChatStore()

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    const socket = connectSocket()

    socket.on('new_message', ({ message }: { message: Message }) => {
      addMessage(message.thread_id, message)
    })

    socket.on('message_deleted', ({ thread_id, message_id }: { thread_id: string; message_id: string }) => {
      deleteMessage(thread_id, message_id)
    })

    socket.on('post_counts_updated', (payload: { post_id: string; like_count?: number; comment_count?: number; share_count?: number }) => {
      const patch: { like_count?: number; comment_count?: number; share_count?: number } = {}
      if (typeof payload.like_count === 'number') patch.like_count = payload.like_count
      if (typeof payload.comment_count === 'number') patch.comment_count = payload.comment_count
      if (typeof payload.share_count === 'number') patch.share_count = payload.share_count
      if (Object.keys(patch).length > 0) {
        useFeedStore.getState().updatePost(payload.post_id, patch)
      }
    })

    socket.on('user_typing', ({ user_id, username, thread_id }: { user_id: string, username: string, thread_id: string }) => {
      const store = useChatStore.getState()
      const current = store.typingUsers[thread_id] ?? []
      if (!current.includes(username)) {
        setTyping(thread_id, [...current, username])
        setTimeout(() => {
          const s = useChatStore.getState()
          setTyping(thread_id, (s.typingUsers[thread_id] ?? []).filter(u => u !== username))
        }, 3000)
      }
    })

    return () => {
      disconnectSocket()
      socket.off('post_counts_updated')
      initialized.current = false
    }
  }, [addMessage, deleteMessage, setTyping])

  return getSocket()
}
