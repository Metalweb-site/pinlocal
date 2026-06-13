'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { sendOtp } from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'
import Button from '@/components/ui/Button'
import toast from 'react-hot-toast'
import StatusDot from '@/components/shared/StatusDot'

export default function LoginPage() {
  const [phone,   setPhone]   = useState('')
  const [loading, setLoading] = useState(false)
  const { setPhone: storePhone } = useAuthStore()
  const router = useRouter()

  const handleSubmit = async () => {
    const cleaned = phone.replace(/\D/g, '')
    if (cleaned.length !== 10) return toast.error('Enter a valid 10-digit number')
    setLoading(true)
    try {
      await sendOtp(`+91${cleaned}`)
      storePhone(`+91${cleaned}`)
      router.push('/auth/verify')
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Failed to send OTP')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col min-h-screen bg-bg relative overflow-hidden">
      <div className="absolute inset-0 grid-bg opacity-70 pointer-events-none" />
      
      <div className="flex flex-col flex-1 px-6 pt-20 pb-10 max-w-sm mx-auto w-full relative z-10">
        {/* Live tag */}
        <div className="flex items-center gap-2 bg-surface border border-border rounded-[8px] px-3 py-2 w-fit mb-12 animate-fade-up">
          <StatusDot color="#2A7F62" size={7} />
          <span className="text-text2 text-[12px] font-semibold">Live in India</span>
        </div>

        {/* Headline */}
        <div className="animate-fade-up" style={{ animationDelay: '0.1s' }}>
          <h1 className="font-body font-black text-[52px] leading-[0.92] tracking-[-0.06em] mb-6">
            Your pincode, organized.
          </h1>
          <p className="text-text2 text-[15px] leading-relaxed mb-auto max-w-[280px] font-medium">
            Connect with real people in your pincode. Discover local groups, join conversations.
          </p>
        </div>

        {/* Form */}
        <div className="mt-16 animate-fade-up" style={{ animationDelay: '0.2s' }}>
          <div className="group flex items-center bg-surface border border-border rounded-[8px] mb-4 overflow-hidden focus-within:border-text1 transition-all duration-300">
            <div className="px-4 h-[56px] flex items-center font-mono text-[15px] font-bold text-text2 border-r border-border bg-bg">
              +91
            </div>
            <input
              type="tel"
              inputMode="numeric"
              maxLength={10}
              value={phone}
              onChange={e => setPhone(e.target.value.replace(/\D/g, ''))}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              placeholder="Phone Number"
              className="flex-1 bg-transparent h-[56px] px-4 text-text1 font-mono text-[17px] outline-none placeholder:text-text3 tracking-wider"
            />
          </div>
          
          <Button onClick={handleSubmit} loading={loading}>
            Send OTP →
          </Button>
          
          <div className="flex flex-col items-center gap-6 mt-10">
            <p className="text-center text-[12px] text-text3 font-medium px-4">
              By continuing, you agree to our <span className="text-text2 underline underline-offset-4 decoration-white/10">Terms</span> and <span className="text-text2 underline underline-offset-4 decoration-white/10">Privacy Policy</span>.
            </p>
            <div className="w-1 h-1 rounded-full bg-border" />
          </div>
        </div>
      </div>
    </div>
  )
}
