'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Bell } from 'lucide-react'
import { useSocket } from '@/hooks/useSocket'
import { getBadges } from '@/lib/api'
import { cn } from '@/lib/utils'

export default function NotificationBell({ className, iconSize = 21 }: { className?: string; iconSize?: number }) {
  const socket = useSocket()
  const [count, setCount] = useState(0)

  useEffect(() => {
    getBadges()
      .then(res => setCount(res.data.badges?.notifications ?? 0))
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!socket) return
    const applyBadges = ({ badges }: { badges?: { notifications?: number } }) => {
      setCount(badges?.notifications ?? 0)
    }
    socket.on('badge_counts_updated', applyBadges)
    return () => {
      socket.off('badge_counts_updated', applyBadges)
    }
  }, [socket])

  return (
    <Link
      href="/alerts"
      className={cn('relative grid h-10 w-10 place-items-center rounded-full text-[#081234]', className)}
      aria-label="Open notifications"
    >
      <Bell size={iconSize} />
      {count > 0 && (
        <span className="absolute right-0 top-0 grid h-4 min-w-4 place-items-center rounded-full bg-[#075CFF] px-1 text-[10px] font-black text-white">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  )
}
