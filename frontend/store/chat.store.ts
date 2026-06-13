import { create } from 'zustand'
import { Message, MessageReaction, Thread } from '@/types'

const uniqueMessages = (messages: Message[]) => {
  const byId = new Map<string, Message>()
  for (const msg of messages) byId.set(msg.id, msg)
  return Array.from(byId.values()).sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )
}

interface ChatState {
  threads:       Thread[]
  messages:      Record<string, Message[]>
  activeThread:  string | null
  typingUsers:   Record<string, string[]>
  setThreads:    (threads: Thread[]) => void
  setMessages:   (threadId: string, msgs: Message[]) => void
  prependMessages:(threadId: string, msgs: Message[]) => void
  addMessage:    (threadId: string, msg: Message) => void
  setActiveThread:(id: string | null) => void
  setTyping:     (threadId: string, users: string[]) => void
  markRead:      (threadId: string) => void
  deleteMessage: (threadId: string, msgId: string) => void
  updateMessageReactions: (threadId: string, msgId: string, reactions: MessageReaction[]) => void
}

export const useChatStore = create<ChatState>((set) => ({
  threads:      [],
  messages:     {},
  activeThread: null,
  typingUsers:  {},
  setThreads:   (threads)  => set({ threads }),
  setMessages:  (tid, msgs) => set(s => ({ messages: { ...s.messages, [tid]: uniqueMessages(msgs) } })),
  prependMessages: (tid, msgs) => set(s => ({
    messages: { ...s.messages, [tid]: uniqueMessages([...msgs, ...(s.messages[tid] ?? [])]) }
  })),
  addMessage: (tid, msg) => set(s => ({
    messages: { ...s.messages, [tid]: uniqueMessages([...(s.messages[tid] ?? []), msg]) }
  })),
  setActiveThread: (id) => set({ activeThread: id }),
  setTyping: (tid, users) => set(s => ({ typingUsers: { ...s.typingUsers, [tid]: users } })),
  markRead:  (tid) => set(s => ({
    threads: s.threads.map(t => t.id === tid ? { ...t, unread_count: 0 } : t)
  })),
  deleteMessage: (tid, msgId) => set(s => ({
    messages: {
      ...s.messages,
      [tid]: (s.messages[tid] ?? []).map(m =>
        m.id === msgId ? { ...m, is_deleted: true, content: 'This message was deleted' } : m
      )
    }
  })),
  updateMessageReactions: (tid, msgId, reactions) => set(s => ({
    messages: {
      ...s.messages,
      [tid]: (s.messages[tid] ?? []).map(m =>
        m.id === msgId ? { ...m, reactions } : m
      )
    }
  })),
}))
