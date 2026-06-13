import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { User } from '@/types'

interface AuthState {
  user: User | null
  phone: string
  setUser: (user: User | null) => void
  setPhone: (phone: string) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user:  null,
      phone: '',
      setUser:  (user)  => set({ user }),
      setPhone: (phone) => set({ phone }),
      logout:   ()      => set({ user: null, phone: '' }),
    }),
    { name: 'pinlocal-auth', partialize: (s) => ({ user: s.user, phone: s.phone }) }
  )
)
