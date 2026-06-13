'use client'
import { useRef, useState } from 'react'

interface SwipeOptions {
  onSwipeRight?: () => void
  threshold?: number
}

export function useSwipe({ onSwipeRight, threshold = 80 }: SwipeOptions) {
  const startX    = useRef(0)
  const currentX  = useRef(0)
  const [dragX, setDragX]       = useState(0)
  const [dragging, setDragging] = useState(false)

  const onStart = (clientX: number) => {
    startX.current   = clientX
    currentX.current = clientX
    setDragging(true)
  }

  const onMove = (clientX: number) => {
    if (!dragging) return
    const dx = Math.max(0, clientX - startX.current)
    currentX.current = clientX
    setDragX(dx)
  }

  const onEnd = () => {
    if (dragX > threshold && onSwipeRight) onSwipeRight()
    setDragX(0)
    setDragging(false)
  }

  const progress = Math.min(dragX / threshold, 1)

  const handlers = {
    onMouseDown: (e: React.MouseEvent)  => onStart(e.clientX),
    onMouseMove: (e: React.MouseEvent)  => onMove(e.clientX),
    onMouseUp:   ()                     => onEnd(),
    onMouseLeave:()                     => onEnd(),
    onTouchStart:(e: React.TouchEvent)  => onStart(e.touches[0].clientX),
    onTouchMove: (e: React.TouchEvent)  => onMove(e.touches[0].clientX),
    onTouchEnd:  ()                     => onEnd(),
  }

  return { dragX, progress, dragging, handlers }
}
