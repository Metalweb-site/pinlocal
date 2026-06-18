'use client'

import { ChangeEvent, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Camera, ImageIcon, Loader2, MapPin, Sparkles, UserRound } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useAuthStore } from '@/store/auth.store'
import { updateMe, uploadMedia } from '@/lib/api'
import { IMAGE_FILE_ACCEPT, validateMediaFile } from '@/lib/media'
import { CATEGORIES } from '@/types'
import Button from '@/components/ui/Button'

function normalizeLocalityValue(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '').trim()
}

export default function ProfileOnboardingPage() {
  const { user, loading: authLoading } = useAuth()
  const { setUser } = useAuthStore()
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement | null>(null)
  const coverRef = useRef<HTMLInputElement | null>(null)
  const [username, setUsername] = useState(user?.username ?? '')
  const [bio, setBio] = useState(user?.bio ?? '')
  const [locationText, setLocationText] = useState(user?.location_text ?? '')
  const [interests, setInterests] = useState<string[]>(user?.interests ?? [])
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url ?? '')
  const [avatarPreview, setAvatarPreview] = useState(user?.avatar_url ?? '')
  const [coverUrl, setCoverUrl] = useState(user?.cover_image_url ?? '')
  const [coverPreview, setCoverPreview] = useState(user?.cover_image_url ?? '')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [coverUploading, setCoverUploading] = useState(false)

  useEffect(() => {
    if (!user) return
    setUsername(user.username ?? '')
    setBio(user.bio ?? '')
    setLocationText(user.location_text ?? user.locality_name ?? user.city ?? '')
    setInterests(user.interests ?? [])
    setAvatarUrl(user.avatar_url ?? '')
    setAvatarPreview(user.avatar_url ?? '')
    setCoverUrl(user.cover_image_url ?? '')
    setCoverPreview(user.cover_image_url ?? '')
  }, [user])

  const toggleInterest = (label: string) => {
    setInterests(prev => prev.includes(label) ? prev.filter(item => item !== label) : [...prev, label])
  }

  const handleAvatar = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const validationError = validateMediaFile(file, { imageOnly: true })
    if (validationError) {
      toast.error(validationError)
      e.target.value = ''
      return
    }

    setAvatarPreview(URL.createObjectURL(file))
    setUploading(true)
    try {
      const res = await uploadMedia(file)
      setAvatarUrl(res.data.url)
      toast.success('Profile photo added')
    } catch (error: any) {
      setAvatarPreview(avatarUrl)
      toast.error(error?.response?.data?.message ?? 'Photo upload failed')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const handleCover = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const validationError = validateMediaFile(file, { imageOnly: true })
    if (validationError) {
      toast.error(validationError)
      e.target.value = ''
      return
    }

    setCoverPreview(URL.createObjectURL(file))
    setCoverUploading(true)
    try {
      const res = await uploadMedia(file)
      setCoverUrl(res.data.url)
      toast.success('Cover photo added')
    } catch (error: any) {
      setCoverPreview(coverUrl)
      toast.error(error?.response?.data?.message ?? 'Cover upload failed')
    } finally {
      setCoverUploading(false)
      e.target.value = ''
    }
  }

  const handleSave = async () => {
    const cleanUsername = username.trim()
    if (cleanUsername.length < 3) {
      toast.error('Name must be at least 3 characters')
      return
    }
    const cleanBio = bio.trim()
    const cleanLocation = locationText.trim()
    if (cleanBio.length < 12) {
      toast.error('Add a short bio')
      return
    }
    if (cleanLocation.length < 2) {
      toast.error('Add your local area')
      return
    }
    if (interests.length === 0) {
      toast.error('Pick at least one interest')
      return
    }
    if (!user?.primary_pincode || user.primary_pincode === '000000') {
      router.push('/auth/pincode')
      return
    }

    setSaving(true)
    try {
      const previousLocality = user?.locality_name ?? user?.location_text ?? ''
      const res = await updateMe({
        username: cleanUsername,
        bio: cleanBio,
        location_text: cleanLocation,
        locality_name: cleanLocation,
        locality_confirmed: true,
        locality_user_edited: normalizeLocalityValue(cleanLocation) !== normalizeLocalityValue(previousLocality),
        location_source: normalizeLocalityValue(cleanLocation) !== normalizeLocalityValue(previousLocality)
          ? 'manual'
          : (user?.location_source ?? 'gps'),
        interests,
        ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
        ...(coverUrl ? { cover_image_url: coverUrl } : {}),
      })
      setUser(res.data.user)
      toast.success('Profile ready')
      router.push('/feed')
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? 'Could not save profile')
    } finally {
      setSaving(false)
    }
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 size={28} className="animate-spin text-coral" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#FBFCFF] px-4 py-5 text-[#081234] sm:py-8">
      <div className="mx-auto w-full max-w-3xl overflow-hidden form-hero">
        <div className="border-b border-[#E4E9F4] p-5 sm:p-6">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-[14px] bg-[#075CFF] text-white shadow-[0_14px_32px_rgba(7,92,255,0.28)]">
            <UserRound size={23} />
          </div>
          <h1 className="text-[28px] font-black leading-[1.02] tracking-[-0.05em] sm:text-[34px]">Build your PinLocal profile</h1>
          <p className="mt-2 max-w-xl text-[13px] font-semibold leading-relaxed text-[#697391] sm:text-[14px]">
            Add the details neighbours need before they trust a post, join your group, or message you.
          </p>
        </div>

        <div className="space-y-6 p-4 sm:p-6">
          <div className="form-section overflow-hidden">
            <button type="button" onClick={() => coverRef.current?.click()} className="relative block h-36 w-full overflow-hidden text-left">
              {coverPreview ? <img src={coverPreview} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full w-full place-items-center text-[#697391]"><ImageIcon size={30} /></div>}
              <span className="absolute right-4 top-4 inline-flex h-9 items-center gap-2 rounded-[8px] bg-white/95 px-3 text-[12px] font-black text-[#075CFF] shadow">
                {coverUploading ? <Loader2 size={14} className="animate-spin" /> : <ImageIcon size={14} />}
                Cover optional
              </span>
            </button>
            <div className="flex flex-col items-start gap-4 px-4 pb-4 pt-2 sm:flex-row sm:items-center sm:px-5 sm:pb-5">
              <button type="button" onClick={() => fileRef.current?.click()} className="relative -mt-10 h-24 w-24 flex-shrink-0 overflow-hidden rounded-full border-[5px] border-white bg-white shadow-[0_18px_42px_rgba(30,56,104,0.18)]">
                {avatarPreview ? <img src={avatarPreview} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full w-full place-items-center text-[#697391]"><Camera size={24} /></div>}
                <span className="absolute inset-x-0 bottom-0 grid h-7 place-items-center bg-[#075CFF]/90 text-[10px] font-black uppercase text-white">
                  {uploading ? 'Uploading' : 'Photo'}
                </span>
              </button>
              <div className="min-w-0 pt-0 sm:pt-4">
                <p className="text-[14px] font-black">Photos are optional</p>
                <p className="mt-1 text-[12px] font-semibold leading-relaxed text-[#697391]">A real photo helps conversations feel safer, but you can add it later.</p>
              </div>
              <input ref={fileRef} type="file" accept={IMAGE_FILE_ACCEPT} className="hidden" onChange={handleAvatar} />
              <input ref={coverRef} type="file" accept={IMAGE_FILE_ACCEPT} className="hidden" onChange={handleCover} />
            </div>
          </div>

          <div className="form-surface p-4 sm:p-5">
            <div className="mb-4">
              <div className="form-kicker">
                <UserRound size={12} className="text-[#075CFF]" />
                First impression
              </div>
            </div>
            {(user?.city || user?.district || user?.state) && (
              <div className="mb-4 rounded-[16px] border border-[#D7E5FF] bg-[#F5F8FF] px-4 py-3 shadow-[0_10px_28px_rgba(7,92,255,0.06)]">
                <div className="text-[11px] font-black uppercase tracking-[0.12em] text-[#075CFF]">Location context</div>
                <p className="mt-1 text-[14px] font-black text-[#081234]">
                  {user?.location_text || user?.locality_name || user?.city}
                </p>
                <p className="mt-1 text-[12px] font-semibold text-[#697391]">
                  {[user?.city, user?.district, user?.state].filter(Boolean).join(' • ')}
                </p>
              </div>
            )}
            <div className="grid gap-4 md:grid-cols-2">
            <Field label="Name">
              <input value={username} onChange={(e) => setUsername(e.target.value.replace(/[^a-z0-9_. ]/gi, '').slice(0, 30))} placeholder="Your public name" className="form-input" />
            </Field>
            <Field label="Local area">
              <div className="relative">
                <MapPin size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#075CFF]" />
                <input value={locationText} onChange={(e) => setLocationText(e.target.value.slice(0, 120))} placeholder="Versova, Mumbai" className="form-input form-input-with-icon pr-4" />
              </div>
              <p className="form-helper">Use the area name locals actually say in real life.</p>
            </Field>
            </div>
          </div>

          <Field label="Bio">
            <textarea value={bio} onChange={(e) => setBio(e.target.value.slice(0, 240))} placeholder="Tell neighbours what you care about, what you do, or how you can help locally." className="form-textarea min-h-[150px]" />
            <p className="mt-2 text-right text-[11px] font-bold text-[#8B96B2]">{bio.length}/240</p>
          </Field>

          <div>
            <div className="mb-3 flex items-center gap-2 text-[12px] font-black uppercase tracking-[0.12em] text-[#697391]">
              Interests <Sparkles size={14} className="text-[#075CFF]" />
            </div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {CATEGORIES.map(category => {
                const selected = interests.includes(category.label)
                return (
                  <button key={category.label} type="button" onClick={() => toggleInterest(category.label)} className={`min-h-12 px-3 text-left ${selected ? 'form-chip form-chip-active' : 'form-chip'}`}>
                    <span className="mr-2">{category.emoji}</span>
                    {category.label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="border-t border-[#E4E9F4] bg-[#F7FAFF] p-5">
          <Button onClick={handleSave} loading={saving || uploading || coverUploading} disabled={saving || uploading || coverUploading}>
            Finish profile
          </Button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[12px] font-black uppercase tracking-[0.12em] text-[#697391]">{label}</span>
      {children}
    </label>
  )
}
