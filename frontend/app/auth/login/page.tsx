'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, MapPin, ShieldCheck } from 'lucide-react'
import { sendOtp } from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'
import Button from '@/components/ui/Button'
import toast from 'react-hot-toast'
import StatusDot from '@/components/shared/StatusDot'

export default function LoginPage() {
  const [phone, setPhone] = useState('')
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
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[#F7FAFF]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(7,92,255,0.10),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(7,92,255,0.08),transparent_28%)]" />
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-40" />

      <div className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-6 pt-6 sm:px-6 sm:pb-8 sm:pt-10">
        <div className="flex items-center justify-between gap-3 animate-fade-up">
          <div className="flex items-center gap-3">
            <div className="grid h-14 w-14 place-items-center rounded-[16px] bg-[#075CFF] text-white shadow-[0_16px_36px_rgba(7,92,255,0.24)]">
              <MapPin size={28} strokeWidth={2.6} />
            </div>
            <div>
              <p className="text-[26px] font-black tracking-[-0.05em] text-[#081234]">PinLocal</p>
              <p className="text-[12px] font-bold text-[#697391]">Neighbourhood network</p>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-full border border-[#DDE5F3] bg-white px-3 py-2 shadow-[0_10px_24px_rgba(30,56,104,0.04)]">
            <StatusDot color="#2A7F62" size={7} />
            <span className="text-[12px] font-semibold text-[#44506E]">India live</span>
          </div>
        </div>

        <div className="mt-6 flex flex-1 items-start sm:mt-8 sm:items-center">
          <div className="w-full animate-fade-up" style={{ animationDelay: '0.1s' }}>
            <div className="form-card overflow-hidden p-5 sm:p-6">
              <div className="rounded-[22px] bg-[linear-gradient(135deg,#F4F8FF_0%,#FFFFFF_55%,#F8FBFF_100%)] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)]">
                <div className="inline-flex items-center gap-2 rounded-full border border-[#D7E5FF] bg-white px-3 py-2 text-[11px] font-black uppercase tracking-[0.08em] text-[#075CFF] shadow-[0_10px_20px_rgba(7,92,255,0.06)]">
                  <ShieldCheck size={14} />
                  OTP sign-in
                </div>

                <h1 className="mt-4 font-body text-[34px] font-black leading-[0.94] tracking-[-0.05em] text-[#081234] sm:text-[40px]">
                  Enter your number. Get in fast.
                </h1>
                <p className="mt-3 max-w-[320px] text-[14px] font-semibold leading-relaxed text-[#697391]">
                  One OTP, then your feed, groups, chats, and local community open up.
                </p>
              </div>

              <div className="mt-5">
                <label className="block">
                  <span className="form-label">Phone number</span>
                  <div className="flex overflow-hidden rounded-[16px] border border-[#D8E2F2] bg-white shadow-[0_14px_30px_rgba(30,56,104,0.05)] transition-all focus-within:border-[#075CFF] focus-within:shadow-[0_0_0_4px_rgba(7,92,255,0.10),0_18px_36px_rgba(7,92,255,0.10)]">
                    <div className="flex h-[56px] items-center border-r border-[#E4EAF5] bg-[#F8FBFF] px-4 font-mono text-[15px] font-black text-[#44506E]">
                      +91
                    </div>
                    <input
                      type="tel"
                      inputMode="numeric"
                      maxLength={10}
                      value={phone}
                      onChange={e => setPhone(e.target.value.replace(/\D/g, ''))}
                      onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                      placeholder="10-digit mobile number"
                      className="h-[56px] flex-1 bg-transparent px-4 font-mono text-[18px] font-black tracking-[0.06em] text-[#081234] outline-none placeholder:tracking-normal placeholder:text-[#8B96B2]"
                    />
                  </div>
                </label>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="form-section flex items-center gap-3 p-3">
                  <div className="grid h-10 w-10 place-items-center rounded-[12px] bg-[#EEF4FF] text-[#075CFF]">
                    <ShieldCheck size={18} />
                  </div>
                  <div>
                    <p className="text-[12px] font-black text-[#081234]">Secure</p>
                    <p className="mt-1 text-[11px] font-semibold text-[#697391]">OTP-based access</p>
                  </div>
                </div>
                <div className="form-section flex items-center gap-3 p-3">
                  <div className="grid h-10 w-10 place-items-center rounded-[12px] bg-[#EEF4FF] text-[#075CFF]">
                    <MapPin size={18} />
                  </div>
                  <div>
                    <p className="text-[12px] font-black text-[#081234]">Local-first</p>
                    <p className="mt-1 text-[11px] font-semibold text-[#697391]">Built around your pincode</p>
                  </div>
                </div>
              </div>

              <div className="mt-5">
                <Button onClick={handleSubmit} loading={loading} className="h-[56px] text-[15px]">
                  <span className="flex items-center gap-2">
                    Send OTP
                    <ArrowRight size={16} />
                  </span>
                </Button>
              </div>

              <p className="mt-4 text-center text-[12px] font-medium leading-relaxed text-[#697391]">
                By continuing, you agree to our <span className="font-bold text-[#081234]">Terms</span> and <span className="font-bold text-[#081234]">Privacy Policy</span>.
              </p>
            </div>

            <div className="mt-4 flex items-center justify-center gap-2 text-[11px] font-semibold text-[#697391] sm:hidden">
              <StatusDot color="#2A7F62" size={6} />
              Fast sign-in for India numbers
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
