import { create } from 'zustand'
import { Post } from '@/types'

interface FeedState {
  posts:      Post[]
  page:       number
  hasMore:    boolean
  category:   string
  loading:    boolean
  setPosts:   (posts: Post[]) => void
  appendPosts:(posts: Post[]) => void
  setPage:    (page: number) => void
  setHasMore: (v: boolean) => void
  setCategory:(cat: string) => void
  setLoading: (v: boolean) => void
  removePost: (id: string) => void
  updatePost: (id: string, patch: Partial<Post>) => void
}

export const useFeedStore = create<FeedState>((set) => ({
  posts:      [],
  page:       1,
  hasMore:    true,
  category:   'for_you',
  loading:    false,
  setPosts:    (posts)       => set({ posts }),
  appendPosts: (posts)       => set((s) => ({ posts: [...s.posts, ...posts] })),
  setPage:     (page)        => set({ page }),
  setHasMore:  (hasMore)     => set({ hasMore }),
  setCategory: (category)    => set({ category }),
  setLoading:  (loading)     => set({ loading }),
  removePost:  (id)          => set((s) => ({ posts: s.posts.filter(p => p.id !== id) })),
  updatePost:  (id, patch)   => set((s) => ({
    posts: s.posts.map(p => p.id === id ? { ...p, ...patch } : p)
  })),
}))
