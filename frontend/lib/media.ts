const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif']
const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov']
export const MEDIA_FILE_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/avif,video/mp4,video/webm,video/quicktime'
export const IMAGE_FILE_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/avif'

export function mediaExtension(url: string) {
  const clean = url.split('?')[0]?.split('#')[0] ?? ''
  return clean.split('.').pop()?.toLowerCase() ?? ''
}

export function isVideoUrl(url?: string | null) {
  if (!url) return false
  return VIDEO_EXTENSIONS.includes(mediaExtension(url))
}

export function isImageUrl(url?: string | null) {
  if (!url) return false
  return IMAGE_EXTENSIONS.includes(mediaExtension(url))
}

export function mediaTypeFromUrl(url?: string | null): 'image' | 'video' | 'unknown' {
  if (isVideoUrl(url)) return 'video'
  if (isImageUrl(url)) return 'image'
  return 'unknown'
}

export function validateMediaFile(file: File, options?: { imageOnly?: boolean }) {
  const allowedImages = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
  const allowedVideos = ['video/mp4', 'video/webm', 'video/quicktime']
  const allowed = options?.imageOnly ? allowedImages : [...allowedImages, ...allowedVideos]

  if (!allowed.includes(file.type)) {
    return options?.imageOnly
      ? 'Choose a JPG, PNG, WEBP, GIF, or AVIF image.'
      : 'Choose a JPG, PNG, WEBP, GIF, AVIF, MP4, WEBM, or MOV file.'
  }

  const maxBytes = file.type.startsWith('image/') ? 10 * 1024 * 1024 : 50 * 1024 * 1024
  if (file.size > maxBytes) {
    return file.type.startsWith('image/') ? 'Images must be 10MB or smaller.' : 'Videos must be 50MB or smaller.'
  }

  return null
}
