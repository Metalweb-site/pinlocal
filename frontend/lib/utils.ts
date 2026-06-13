import { formatDistanceToNow, format } from 'date-fns'

export const timeAgo = (date: string) =>
  formatDistanceToNow(new Date(date), { addSuffix: true })

export const formatTime = (date: string) =>
  format(new Date(date), 'h:mm a')

export const formatDate = (date: string) =>
  format(new Date(date), 'MMM d')

export const getInitial = (name: string | null | undefined) =>
  (name ?? '?')[0].toUpperCase()

export const formatCount = (n: number): string => {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

export const cn = (...classes: (string | undefined | false | null)[]) =>
  classes.filter(Boolean).join(' ')
