'use client'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, ShieldCheck, RefreshCw, Lock } from 'lucide-react'
import { verifyOtp, verifyPasscode, sendOtp } from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'
import Button from '@/components/ui/Button'
import toast from 'react-hot-toast'

export default function VerifyPage() {
  const [code,    setCode]    = useState(['','','','','',''])
  const [passcode, setPasscode] = useState('')
  const [passcodeToken, setPasscodeToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [timer,   setTimer]   = useState(42)
  const { phone, setUser }    = useAuthStore()
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
      setCode(['','','','','',''])
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
      toast.success('New code sent!')
    } catch {
      toast.error('Failed to resend')
    }
  }

  return (
    <div className="flex flex-col min-h-screen bg-bg relative overflow-hidden">
      {/* Dynamic Background Elements */}
      <div className="absolute inset-0 grid-bg opacity-10 pointer-events-none" />
      <motion.div 
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.5, ease: "easeOut" }}
        className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-coral/5 blur-[150px] rounded-full pointer-events-none" 
      />
      
      <div className="flex flex-col flex-1 px-8 pt-12 pb-10 max-w-sm mx-auto w-full relative z-10">
        <motion.button 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          onClick={() => router.back()} 
          className="flex items-center gap-2 text-text3 text-[14px] mb-12 hover:text-text1 transition-all active:scale-95 w-fit font-bold uppercase tracking-widest"
        >
          <ArrowLeft size={18} strokeWidth={3} /> Back
        </motion.button>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <h1 className="font-display font-black text-[58px] leading-[0.85] uppercase tracking-tighter mb-4">
            CHECK<br />
            <span className="text-coral">YOUR PHONE.</span>
          </h1>
          <div className="flex items-center gap-3 bg-surface2/40 border border-white/[0.05] rounded-2xl px-4 py-3 mb-12 w-fit backdrop-blur-md">
            <div className="w-8 h-8 rounded-xl bg-mint/10 flex items-center justify-center text-mint">
              <ShieldCheck size={18} strokeWidth={2.5} />
            </div>
            <p className="text-text2 text-[14px] font-medium">
              {passcodeToken ? 'Passcode required for' : 'Code sent to'} <span className="text-text1 font-bold tracking-wider">{phone}</span>
            </p>
          </div>
        </motion.div>

        {/* OTP Input Container */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="relative group"
        >
          {!passcodeToken ? (
            <div className="flex gap-2.5 mb-8">
              {code.map((digit, i) => (
              <motion.div
                key={i}
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.1 + i * 0.05 }}
                className="flex-1"
              >
                <input
                  ref={el => { inputRefs.current[i] = el }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={e => handleChange(i, e.target.value)}
                  onKeyDown={e => handleKey(i, e)}
                  className={`w-full h-[72px] bg-surface2/30 backdrop-blur-xl rounded-[16px] text-center font-display text-[36px] font-black outline-none transition-all duration-500 border-2 ${
                    digit 
                      ? 'border-coral shadow-[0_0_25px_rgba(255,77,0,0.15)] text-coral bg-coral/5' 
                      : 'border-white/[0.05] text-text3 focus:border-white/20'
                  }`}
                />
              </motion.div>
              ))}
            </div>
          ) : (
            <div className="mb-8">
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
                placeholder="Enter passcode"
                className="h-[72px] w-full rounded-[16px] border-2 border-white/[0.08] bg-surface2/30 px-5 text-center font-display text-[32px] font-black tracking-[0.24em] text-coral outline-none backdrop-blur-xl transition-all focus:border-coral"
              />
              <p className="mt-3 text-center text-[11px] font-bold uppercase tracking-[1.5px] text-text3">4 to 8 digit profile passcode</p>
            </div>
          )}

          <AnimatePresence>
            {loading && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-bg/60 backdrop-blur-sm rounded-[20px] flex items-center justify-center z-20 border border-white/5"
              >
                <div className="flex flex-col items-center gap-3">
                  <div className="w-10 h-10 border-4 border-coral/20 border-t-coral rounded-full animate-spin" />
                  <span className="text-coral font-mono text-[10px] font-black uppercase tracking-[3px]">Verifying</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Resend Logic */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-center mb-12"
        >
          {!passcodeToken && <button 
            onClick={handleResend}
            disabled={timer > 0}
            className={`group flex items-center justify-center gap-2 mx-auto px-6 py-2 rounded-full transition-all ${
              timer > 0 
                ? 'text-text3 cursor-not-allowed' 
                : 'text-text2 hover:text-coral hover:bg-coral/5'
            }`}
          >
            <RefreshCw size={14} className={timer > 0 ? '' : 'group-hover:rotate-180 transition-transform duration-500'} />
            <span className="text-[12px] font-bold uppercase tracking-[1.5px]">
              {timer > 0 ? `Resend in ${timer}s` : 'Resend Code Now'}
            </span>
          </button>}
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mt-auto"
        >
          <Button 
            onClick={() => passcodeToken ? submitPasscode() : submitCode(code.join(''))} 
            loading={loading}
            disabled={passcodeToken ? passcode.length < 4 : code.some(c => !c)}
            className="h-[64px] text-[20px] rounded-[20px] shadow-[0_12px_40px_rgba(255,77,0,0.3)] relative overflow-hidden group"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
            <span className="flex items-center gap-2">
              {passcodeToken ? 'Unlock Account' : 'Verify & Enter'} <Lock size={18} />
            </span>
          </Button>
          <p className="text-center text-[11px] text-text3 mt-6 font-mono uppercase tracking-widest opacity-50">
            Secure 256-bit Encrypted Connection
          </p>
        </motion.div>
      </div>
    </div>
  )
}
