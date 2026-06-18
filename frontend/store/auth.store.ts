import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { User } from '@/types'

interface AuthState {
  user: User | null
  phone: string
  activePincode: string | null
  setUser: (user: User | null) => void
  setPhone: (phone: string) => void
  setActivePincode: (pincode: string | null) => void
  logout: () => void
}

const resolveActivePincode = (user: User | null, current?: string | null) => {
  if (!user) return null
  const options = [user.primary_pincode, user.secondary_pincode].filter(Boolean) as string[]
  if (current && options.includes(current)) return current
  return user.primary_pincode ?? null
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user:  null,
      phone: '',
      activePincode: null,
      setUser:  (user)  => set({ user, activePincode: resolveActivePincode(user, get().activePincode) }),
      setPhone: (phone) => set({ phone }),
      setActivePincode: (pincode) => set({ activePincode: resolveActivePincode(get().user, pincode) }),
      logout:   ()      => set({ user: null, phone: '', activePincode: null }),
    }),
    { name: 'pinlocal-auth', partialize: (s) => ({ user: s.user, phone: s.phone, activePincode: s.activePincode }) }
  )
)
