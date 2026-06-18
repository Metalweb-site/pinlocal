'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Lock, RefreshCw, ShieldCheck } from 'lucide-react'
import { verifyOtp, verifyPasscode, sendOtp } from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'
import Button from '@/components/ui/Button'
import toast from 'react-hot-toast'

export default function VerifyPage() {
  const [code, setCode] = useState(['', '', '', '', '', ''])
  const [passcode, setPasscode] = useState('')
  const [passcodeToken, setPasscodeToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [timer, setTimer] = useState(42)
  const { phone, setUser } = useAuthStore()
  const router = useRouter()
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    if (!phone) router.push('/auth/login')
    inputRefs.current[0]?.focus()
    const interval = setInterval(() => setTimer(t => (t > 0 ? t - 1 : 0)), 1000)
    return () => clearInterval(interval)
  }, [phone, router])

  const handleKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !code[i] && i > 0) {
      inputRefs.current[i - 1]?.focus()
    }
  }

  const handleChange = (i: number, val: string) => {
    if (!/^\d*$/.test(val)) return
    const next = [...code]
    next[i] = val.slice(-1)
    setCode(next)
    if (val && i < 5) inputRefs.current[i + 1]?.focus()
    if (next.every(Boolean)) {
      submitCode(next.join(''))
    }
  }

  const submitCode = async (otp: string) => {
    setLoading(true)
    try {
      const res = await verifyOtp(phone, otp)
      if (res.data.passcode_required) {
        setPasscodeToken(res.data.passcode_token)
        setPasscode('')
        toast.success('Enter your passcode')
        return
      }
      setUser(res.data.user)
      if (res.data.isNew || !res.data.user.primary_pincode || res.data.user.primary_pincode === '000000') router.push('/auth/pincode')
      else if (!res.data.user.username || !res.data.user.bio || !res.data.user.location_text || (res.data.user.interests ?? []).length === 0) router.push('/auth/profile')
      else router.push('/feed')
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Invalid OTP')
      setCode(['', '', '', '', '', ''])
      inputRefs.current[0]?.focus()
    } finally {
      setLoading(false)
    }
  }

  const submitPasscode = async () => {
    if (!passcodeToken || passcode.length < 4) return
    setLoading(true)
    try {
      const res = await verifyPasscode(passcodeToken, passcode)
      setUser(res.data.user)
      if (!res.data.user.primary_pincode || res.data.user.primary_pincode === '000000') router.push('/auth/pincode')
      else if (!res.data.user.username || !res.data.user.bio || !res.data.user.location_text || (res.data.user.interests ?? []).length === 0) router.push('/auth/profile')
      else router.push('/feed')
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Incorrect passcode')
      setPasscode('')
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    if (timer > 0) return
    try {
      await sendOtp(phone)
      setTimer(60)
      toast.success('New code sent')
    } catch {
      toast.error('Failed to resend')
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[#F7FAFF]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(7,92,255,0.10),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(7,92,255,0.08),transparent_30%)]" />
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-40" />

      <div className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-10 pt-10 sm:px-6">
        <button
          onClick={() => router.back()}
          className="mb-8 flex w-fit items-center gap-2 rounded-full border border-[#DDE5F3] bg-white px-4 py-2 text-[13px] font-black text-[#44506E] shadow-[0_10px_24px_rgba(30,56,104,0.04)]"
        >
          <ArrowLeft size={16} />
          Back
        </button>

        <div className="animate-fade-up">
          <h1 className="font-body text-[42px] font-black leading-[0.92] tracking-[-0.06em] text-[#081234] sm:text-[48px]">
            Check your phone.
          </h1>
          <div className="mt-5 inline-flex max-w-full items-center gap-3 rounded-[16px] border border-[#DDE5F3] bg-white px-4 py-3 shadow-[0_14px_30px_rgba(30,56,104,0.04)]">
            <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-[12px] bg-[#EEF4FF] text-[#075CFF]">
              {passcodeToken ? <Lock size={18} /> : <ShieldCheck size={18} />}
            </div>
            <p className="min-w-0 text-[13px] font-semibold leading-relaxed text-[#44506E]">
              {passcodeToken ? 'Passcode required for ' : 'Code sent to '}
              <span className="font-black tracking-[0.04em] text-[#081234]">{phone}</span>
            </p>
          </div>
        </div>

        <div className="mt-8 form-card p-5 sm:p-6">
          {!passcodeToken ? (
            <>
              <label className="block">
                <span className="form-label">One-time password</span>
                <div className="grid grid-cols-6 gap-2.5">
                  {code.map((digit, i) => (
                    <input
                      key={i}
                      ref={el => { inputRefs.current[i] = el }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={e => handleChange(i, e.target.value)}
                      onKeyDown={e => handleKey(i, e)}
                      className={`h-[62px] rounded-[16px] border text-center font-body text-[28px] font-black outline-none transition-all ${
                        digit
                          ? 'border-[#075CFF] bg-[#F4F8FF] text-[#075CFF] shadow-[0_14px_28px_rgba(7,92,255,0.10)]'
                          : 'border-[#D8E2F2] bg-white text-[#081234] shadow-[0_10px_24px_rgba(30,56,104,0.04)] focus:border-[#075CFF] focus:shadow-[0_0_0_4px_rgba(7,92,255,0.10)]'
                      }`}
                    />
                  ))}
                </div>
              </label>
              <p className="mt-4 text-center text-[12px] font-semibold text-[#697391]">Enter the 6-digit OTP we sent to your phone.</p>
            </>
          ) : (
            <>
              <label className="block">
                <span className="form-label">Passcode</span>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  value={passcode}
                  onChange={e => setPasscode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  onKeyDown={e => {
                    if (e.key === 'Enter') submitPasscode()
                  }}
                  autoFocus
                  placeholder="Enter 4 to 8 digits"
                  className="form-input h-[62px] text-center font-body text-[24px] tracking-[0.22em]"
                />
              </label>
              <div className="mt-4 rounded-[14px] border border-[#FFE0B8] bg-[#FFF9F0] p-3 text-[12px] font-bold leading-relaxed text-[#8A4B10]">
                This passcode is your second lock after OTP verification.
              </div>
            </>
          )}

          <div className="mt-6">
            <Button
              onClick={() => passcodeToken ? submitPasscode() : submitCode(code.join(''))}
              loading={loading}
              disabled={passcodeToken ? passcode.length < 4 : code.some(c => !c)}
              className="h-[56px] text-[15px]"
            >
              {passcodeToken ? 'Unlock Account' : 'Verify and Continue'}
            </Button>
          </div>

          {!passcodeToken && (
            <button
              onClick={handleResend}
              disabled={timer > 0}
              className={`mt-4 flex w-full items-center justify-center gap-2 rounded-[12px] px-4 py-3 text-[12px] font-black transition-all ${
                timer > 0 ? 'text-[#94A3B8]' : 'text-[#075CFF] hover:bg-[#F4F8FF]'
              }`}
            >
              <RefreshCw size={14} className={timer > 0 ? '' : 'transition-transform duration-300 group-hover:rotate-180'} />
              {timer > 0 ? `Resend in ${timer}s` : 'Resend code'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
