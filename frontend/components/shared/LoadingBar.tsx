'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

const START_EVENT = 'pinlocal:loading-start'
const END_EVENT = 'pinlocal:loading-end'

export default function LoadingBar() {
  const pathname = usePathname()
  const [visible, setVisible] = useState(false)
  const [progress, setProgress] = useState(0)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const start = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    if (settleTimer.current) clearTimeout(settleTimer.current)
    setVisible(true)
    setProgress((current) => (current > 0 && current < 90 ? current : 18))
  }, [])

  const finish = useCallback(() => {
    setProgress(100)
    hideTimer.current = setTimeout(() => {
      setVisible(false)
      setProgress(0)
    }, 220)
  }, [])

  useEffect(() => {
    if (!visible || progress >= 90) return
    const interval = setInterval(() => {
      setProgress((current) => Math.min(current + Math.max(1, (90 - current) * 0.12), 90))
    }, 180)
    return () => clearInterval(interval)
  }, [visible, progress])

  useEffect(() => {
    const onStart = () => start()
    const onEnd = () => finish()

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const target = event.target as HTMLElement | null
      const anchor = target?.closest('a[href]') as HTMLAnchorElement | null
      if (!anchor || anchor.target || anchor.hasAttribute('download')) return

      const url = new URL(anchor.href)
      if (url.origin !== window.location.origin) return
      if (`${url.pathname}${url.search}` === `${window.location.pathname}${window.location.search}`) return

      start()
      settleTimer.current = setTimeout(() => finish(), 4500)
    }

    window.addEventListener(START_EVENT, onStart)
    window.addEventListener(END_EVENT, onEnd)
    document.addEventListener('click', onClick)

    return () => {
      window.removeEventListener(START_EVENT, onStart)
      window.removeEventListener(END_EVENT, onEnd)
      document.removeEventListener('click', onClick)
      if (hideTimer.current) clearTimeout(hideTimer.current)
      if (settleTimer.current) clearTimeout(settleTimer.current)
    }
  }, [finish, start])

  useEffect(() => {
    if (visible) finish()
  }, [pathname, visible, finish])

  return (
    <div
      aria-hidden="true"
      className={`fixed left-0 right-0 top-0 z-[100] h-[2px] overflow-hidden transition-opacity duration-200 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div
        className="h-full bg-text1 transition-[width] duration-200 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  )
}
