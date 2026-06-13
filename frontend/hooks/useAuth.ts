'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth.store'
import { getMe } from '@/lib/api'

export function useAuth(redirectIfUnauthenticated = true) {
  const { user, setUser } = useAuthStore()
  const [loading, setLoading] = useState(!user)
  const router = useRouter()

  useEffect(() => {
    if (!user) {
      setLoading(true)
      getMe()
        .then(res => {
          setUser(res.data.user)
          setLoading(false)
        })
        .catch(() => {
          setLoading(false)
          if (redirectIfUnauthenticated) router.push('/auth/login')
        })
    } else {
      setLoading(false)
    }
  }, [user, setUser, router, redirectIfUnauthenticated])

  return { user, loading }
}
