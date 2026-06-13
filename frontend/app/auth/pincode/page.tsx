'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { MapPin } from 'lucide-react'
import { detectPincode, updateMe } from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'
import Button from '@/components/ui/Button'
import toast from 'react-hot-toast'

export default function PincodePage() {
  const [pin,     setPin]     = useState(['','','','','',''])
  const [loading, setLoading] = useState(false)
  const [locating,setLocating]= useState(false)
  const { setUser } = useAuthStore()
  const router = useRouter()
  const refs   = useRef<(HTMLInputElement | null)[]>([])

  const pincode = pin.join('')

  const handleChange = (i: number, val: string) => {
    if (!/^\d*$/.test(val)) return
    const next = [...pin]
    next[i] = val.slice(-1)
    setPin(next)
    if (val && i < 5) refs.current[i + 1]?.focus()
  }

  const handleKey = (i: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !pin[i] && i > 0) refs.current[i-1]?.focus()
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
          setPin(code.split(''))
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
      const res = await updateMe({ primary_pincode: pincode })
      setUser(res.data.user)
      router.push('/auth/profile')
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Invalid pincode')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col flex-1 items-center text-center px-7 pt-16 pb-10 max-w-sm mx-auto w-full">
      <div className="w-16 h-16 rounded-full bg-coral/10 border border-coral/25 flex items-center justify-center mb-6">
        <MapPin size={28} color="#FF4D00" strokeWidth={2} />
      </div>

      <h1 className="font-display font-black text-[60px] leading-[.88] uppercase mb-3">
        WHERE<br />ARE YOU?
      </h1>
      <p className="text-text2 text-[13px] leading-relaxed max-w-[270px] mb-12">
        Your pincode is your neighbourhood. You will only see groups and posts from your area.
      </p>

      {/* Pin boxes */}
      <div className="flex gap-2 mb-6">
        {pin.map((d, i) => (
          <input key={i} ref={el => { refs.current[i] = el }}
            type="text" inputMode="numeric" maxLength={1}
            value={d}
            onChange={e => handleChange(i, e.target.value)}
            onKeyDown={e => handleKey(i, e)}
            className="w-[46px] h-[58px] bg-surface rounded-[8px] text-center font-display text-[26px] font-bold outline-none transition-all"
            style={{
              border: d ? '1.5px solid #FF4D00' : '1.5px solid #2A2A2A',
              color:  d ? '#FF4D00' : '#555',
              background: d ? 'rgba(255,77,0,.07)' : '#1A1A1A',
            }}
          />
        ))}
      </div>

      <p className="text-text3 text-[11px] max-w-[260px] leading-relaxed mb-6">
        Only people in the same pincode can see your groups and posts.
      </p>

      <button onClick={handleGps} disabled={locating}
        className="flex items-center gap-2 border border-border rounded-[14px] px-6 h-12 text-text2 text-[14px] font-body mb-3 w-full max-w-[300px] justify-center active:scale-[.97] transition-all disabled:opacity-50">
        {locating
          ? <><div className="w-3 h-3 border border-text2 border-t-coral rounded-full animate-spin"/> Detecting...</>
          : <><MapPin size={14}/> Use my location →</>
        }
      </button>

      <div className="w-full max-w-[300px]">
        <Button onClick={handleSubmit} loading={loading} disabled={pincode.length !== 6}>
          Enter Neighbourhood →
        </Button>
      </div>
    </div>
  )
}
