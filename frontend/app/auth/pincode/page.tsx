'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, LocateFixed, MapPin } from 'lucide-react'
import { detectPincode, updateMe } from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'
import Button from '@/components/ui/Button'
import toast from 'react-hot-toast'

type DetectedLocation = {
  pincode: string
  locality_name?: string | null
  city?: string | null
  district?: string | null
  state?: string | null
  location_text?: string | null
  lat?: number | null
  lng?: number | null
  accuracy_meters?: number | null
  source?: 'gps' | 'manual' | 'pincode' | null
}

export default function PincodePage() {
  const [pin, setPin] = useState(['', '', '', '', '', ''])
  const [loading, setLoading] = useState(false)
  const [locating, setLocating] = useState(false)
  const [detectedLocation, setDetectedLocation] = useState<DetectedLocation | null>(null)
  const { setUser } = useAuthStore()
  const router = useRouter()
  const refs = useRef<(HTMLInputElement | null)[]>([])

  const pincode = pin.join('')

  const handleChange = (i: number, val: string) => {
    if (!/^\d*$/.test(val)) return
    const next = [...pin]
    next[i] = val.slice(-1)
    setPin(next)
    const nextCode = next.join('')
    if (detectedLocation && nextCode !== detectedLocation.pincode) {
      setDetectedLocation(null)
    }
    if (val && i < 5) refs.current[i + 1]?.focus()
  }

  const handleKey = (i: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !pin[i] && i > 0) refs.current[i - 1]?.focus()
  }

  const handleGps = () => {
    if (!navigator.geolocation) return toast.error('GPS not available')
    if (!window.isSecureContext && !['localhost', '127.0.0.1'].includes(window.location.hostname)) {
      toast.error('Location detection needs HTTPS. Enter pincode manually.')
      return
    }

    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await detectPincode(pos.coords.latitude, pos.coords.longitude)
          const code = String(res.data.pincode ?? '')
          const location = res.data.location ?? null
          setPin(code.split(''))
          if (code.length === 6 && location) {
            setDetectedLocation({
              pincode: code,
              locality_name: location.locality_name,
              city: location.city,
              district: location.district,
              state: location.state,
              location_text: location.location_text,
              lat: location.lat,
              lng: location.lng,
              accuracy_meters: typeof pos.coords.accuracy === 'number' ? Math.round(pos.coords.accuracy) : null,
              source: location.source === 'pincode_meta' ? 'pincode' : 'gps',
            })
          } else {
            setDetectedLocation(null)
          }
          toast.success(`Found: ${code}`)
        } catch (error: any) {
          toast.error(error?.response?.data?.message ?? 'Could not detect pincode. Please enter manually.')
        } finally {
          setLocating(false)
        }
      },
      (error) => {
        const message =
          error.code === error.PERMISSION_DENIED ? 'Location access denied' :
          error.code === error.POSITION_UNAVAILABLE ? 'Location unavailable. Try entering pincode manually.' :
          'Location request timed out. Try again or enter manually.'
        toast.error(message)
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 300000 }
    )
  }

  const handleSubmit = async () => {
    if (pincode.length !== 6) return toast.error('Enter a valid 6-digit pincode')
    setLoading(true)
    try {
      const payload: Record<string, unknown> = { primary_pincode: pincode }
      if (detectedLocation && detectedLocation.pincode === pincode) {
        payload.locality_name = detectedLocation.locality_name ?? null
        payload.locality_confirmed = Boolean(detectedLocation.locality_name)
        payload.locality_user_edited = false
        payload.city = detectedLocation.city ?? null
        payload.district = detectedLocation.district ?? null
        payload.state = detectedLocation.state ?? null
        payload.location_text = detectedLocation.location_text ?? detectedLocation.locality_name ?? detectedLocation.city ?? null
        payload.latitude = detectedLocation.lat ?? null
        payload.longitude = detectedLocation.lng ?? null
        payload.location_source = detectedLocation.source ?? 'gps'
        payload.location_accuracy_meters = detectedLocation.accuracy_meters ?? null
      }

      const res = await updateMe(payload)
      setUser(res.data.user)
      router.push('/auth/profile')
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Invalid pincode')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[#F7FAFF]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(7,92,255,0.10),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(7,92,255,0.08),transparent_28%)]" />
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-40" />

      <div className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-10 pt-12 sm:px-6">
        <div className="grid h-16 w-16 place-items-center rounded-[18px] bg-[#075CFF] text-white shadow-[0_18px_36px_rgba(7,92,255,0.24)]">
          <MapPin size={28} strokeWidth={2.4} />
        </div>

        <h1 className="mt-6 font-body text-[44px] font-black leading-[0.92] tracking-[-0.06em] text-[#081234] sm:text-[50px]">
          Where are you?
        </h1>
        <p className="mt-4 max-w-[320px] text-[14px] font-medium leading-relaxed text-[#697391]">
          Your pincode defines your neighbourhood. It decides what local posts, groups, and events show up for you.
        </p>

        <div className="mt-8 form-card p-5 sm:p-6">
          <label className="block">
            <span className="form-label">Enter pincode</span>
            <div className="grid grid-cols-6 gap-2.5">
              {pin.map((d, i) => (
                <input
                  key={i}
                  ref={el => { refs.current[i] = el }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={d}
                  onChange={e => handleChange(i, e.target.value)}
                  onKeyDown={e => handleKey(i, e)}
                  className={`h-[58px] rounded-[16px] border text-center font-body text-[24px] font-black outline-none transition-all ${
                    d
                      ? 'border-[#075CFF] bg-[#F4F8FF] text-[#075CFF] shadow-[0_12px_24px_rgba(7,92,255,0.10)]'
                      : 'border-[#D8E2F2] bg-white text-[#081234] shadow-[0_10px_24px_rgba(30,56,104,0.04)] focus:border-[#075CFF] focus:shadow-[0_0_0_4px_rgba(7,92,255,0.10)]'
                  }`}
                />
              ))}
            </div>
          </label>

          <p className="mt-4 text-[12px] font-semibold leading-relaxed text-[#697391]">
            People in the same pincode can discover your neighbourhood conversations.
          </p>

          {detectedLocation && detectedLocation.pincode === pincode && (
            <div className="mt-4 rounded-[16px] border border-[#D7E5FF] bg-[#F5F8FF] px-4 py-3 text-left shadow-[0_10px_28px_rgba(7,92,255,0.06)]">
              <div className="text-[11px] font-black uppercase tracking-[0.12em] text-[#075CFF]">Detected area</div>
              <p className="mt-1 text-[14px] font-black text-[#081234]">
                {detectedLocation.location_text || detectedLocation.locality_name || detectedLocation.city || pincode}
              </p>
              <p className="mt-1 text-[12px] font-semibold text-[#697391]">
                {[detectedLocation.city, detectedLocation.district, detectedLocation.state].filter(Boolean).join(' • ')}
              </p>
            </div>
          )}

          <button
            onClick={handleGps}
            disabled={locating}
            className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-[14px] border border-[#D8E2F2] bg-white px-4 text-[13px] font-black text-[#44506E] shadow-[0_12px_28px_rgba(30,56,104,0.04)] transition-all hover:border-[#B8CCFF] hover:text-[#075CFF] disabled:opacity-50"
          >
            {locating ? (
              <>
                <div className="h-4 w-4 rounded-full border-2 border-[#9CB9FF] border-t-[#075CFF] animate-spin" />
                Detecting...
              </>
            ) : (
              <>
                <LocateFixed size={16} />
                Use my location
              </>
            )}
          </button>

          <div className="mt-5">
            <Button onClick={handleSubmit} loading={loading} disabled={pincode.length !== 6} className="h-[56px] text-[15px]">
              <span className="flex items-center gap-2">
                Enter neighbourhood
                <ArrowRight size={16} />
              </span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
