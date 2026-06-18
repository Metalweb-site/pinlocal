'use client'

import { useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Loader2, MapPin, Plus, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { updateMe } from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'
import { useClickOutside } from '@/hooks/useClickOutside'
import { cn } from '@/lib/utils'

type Variant = 'desktop-header' | 'mobile-topbar' | 'sidebar-card'

export default function PincodeSwitcher({ variant = 'desktop-header' }: { variant?: Variant }) {
  const { user, activePincode, setUser, setActivePincode } = useAuthStore()
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [secondaryDraft, setSecondaryDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useClickOutside(ref, () => {
    setOpen(false)
    setAdding(false)
    setSecondaryDraft('')
  }, open)

  const selected = activePincode || user?.primary_pincode || '400001'
  const options = useMemo(() => {
    if (!user) return []
    return [
      { code: user.primary_pincode, label: 'Primary pincode' },
      ...(user.secondary_pincode ? [{ code: user.secondary_pincode, label: 'Secondary pincode' }] : []),
    ]
  }, [user])
  const isHeader = variant === 'desktop-header'
  const isSidebar = variant === 'sidebar-card'
  const isMobile = variant === 'mobile-topbar'

  if (!user) return null

  const switchPincode = (code: string) => {
    setActivePincode(code)
    setOpen(false)
    window.dispatchEvent(new Event('pinlocal:pincode-changed'))
  }

  const saveSecondary = async () => {
    const code = secondaryDraft.trim()
    if (!/^[1-9][0-9]{5}$/.test(code)) {
      toast.error('Enter a valid 6-digit pincode')
      return
    }
    if (code === user.primary_pincode) {
      toast.error('Secondary pincode must be different')
      return
    }

    setSaving(true)
    try {
      const res = await updateMe({ secondary_pincode: code })
      setUser(res.data.user)
      setAdding(false)
      setSecondaryDraft('')
      toast.success('Secondary pincode added')
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? 'Could not save secondary pincode')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className={cn(
          isHeader && 'flex h-12 min-w-[176px] items-center justify-between gap-3 rounded-[12px] border border-[#D7DFF0] bg-white px-4 text-[15px] font-black text-[#081234] shadow-[0_14px_34px_rgba(40,70,120,0.08)] transition-all hover:border-[#BDD0FF] hover:shadow-[0_18px_40px_rgba(40,70,120,0.12)]',
          isMobile && 'flex items-center gap-3',
          isSidebar && 'flex w-full items-center justify-between gap-3 rounded-[14px] border border-[#D9E3F4] bg-[linear-gradient(180deg,#FFFFFF_0%,#F8FBFF_100%)] px-3.5 py-3 shadow-[0_12px_26px_rgba(30,56,104,0.06)] transition-all hover:border-[#BDD0FF]'
        )}
      >
        {isMobile ? (
          <span className="grid h-[46px] w-[46px] place-items-center rounded-[10px] bg-[#075CFF] text-white shadow-[0_10px_22px_rgba(7,92,255,0.22)]">
            <MapPin size={26} strokeWidth={2.6} />
          </span>
        ) : (
          <span className={cn(
            'grid place-items-center rounded-full',
            isHeader && 'h-8 w-8 bg-[#EEF4FF]',
            isSidebar && 'h-9 w-9 bg-[#EEF4FF]'
          )}>
            <MapPin size={isSidebar ? 19 : 18} className="text-[#075CFF]" strokeWidth={isHeader ? 2.4 : 2.6} />
          </span>
        )}

        <span className="min-w-0 flex-1 text-left">
          <span className={cn(
            'block truncate',
            isMobile && 'text-[19px] font-black tracking-[-0.03em]',
            isHeader && 'text-[16px] font-black',
            isSidebar && 'text-[16px] font-black text-[#081234]'
          )}>
            {selected}
          </span>
          {!isMobile && (
            <span className={cn(
              'mt-0.5 block text-[11px] font-semibold text-[#697391]',
              isHeader && 'text-[10px] uppercase tracking-[0.08em]',
              isSidebar && 'text-[11px]'
            )}>
              {user.secondary_pincode ? 'Primary + secondary access' : 'Primary pincode access'}
            </span>
          )}
        </span>
        <ChevronDown size={16} className={cn('flex-shrink-0 text-[#697391]', open && 'rotate-180')} />
      </button>

      {open && (
        <div className={cn(
          'absolute z-50 overflow-hidden border border-[#DDE5F3] bg-white shadow-[0_24px_60px_rgba(30,56,104,0.14)]',
          isMobile && 'left-0 mt-3 w-[300px] rounded-[16px]',
          isHeader && 'left-0 mt-3 w-[340px] rounded-[18px]',
          isSidebar && 'left-0 right-0 mt-2 w-full min-w-0 rounded-[16px]'
        )}>
          <div className={cn(
            'border-b border-[#E4E9F4]',
            isSidebar ? 'px-3.5 py-3.5' : 'px-4 py-4'
          )}>
            <p className="text-[13px] font-black text-[#081234]">Pincode access</p>
            <p className="mt-1 text-[12px] font-semibold leading-relaxed text-[#697391]">
              Switch your live local view between saved pincodes.
            </p>
          </div>

          <div className={cn(isSidebar ? 'p-2.5' : 'p-3')}>
            <div className="space-y-2">
              {options.map(option => {
                const active = option.code === selected
                return (
                  <button
                    key={option.code}
                    type="button"
                    onClick={() => switchPincode(option.code)}
                    className={cn(
                      'flex w-full items-center justify-between rounded-[12px] border text-left transition-all',
                      isSidebar ? 'px-3.5 py-3' : 'px-4 py-3.5',
                      active ? 'border-[#9CB9FF] bg-[#F3F7FF] shadow-[0_12px_24px_rgba(7,92,255,0.08)]' : 'border-[#E4E9F4] bg-white hover:border-[#C9D6FF] hover:bg-[#FAFCFF]'
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-black text-[#081234]">{option.code}</span>
                      <span className="mt-1 block text-[12px] font-semibold text-[#697391]">{option.label}</span>
                    </span>
                    {active && <Check size={18} className="text-[#075CFF]" />}
                  </button>
                )
              })}
            </div>

            {!user.secondary_pincode && !adding && (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-[12px] border border-dashed border-[#BFD0F5] bg-[#F8FBFF] px-4 py-3 text-[13px] font-black text-[#075CFF] transition-all hover:border-[#8FB0FF] hover:bg-[#F3F7FF]"
              >
                <Plus size={16} />
                Add secondary pincode
              </button>
            )}

            {adding && (
              <div className="mt-3 rounded-[14px] border border-[#E4E9F4] bg-[#FBFCFF] p-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[13px] font-black text-[#081234]">Add secondary pincode</p>
                  <button type="button" onClick={() => { setAdding(false); setSecondaryDraft('') }} className="text-[#697391]">
                    <X size={16} />
                  </button>
                </div>
                <input
                  value={secondaryDraft}
                  onChange={e => setSecondaryDraft(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="Enter 6-digit pincode"
                  className="form-input"
                />
                <p className="mt-2 text-[11px] font-semibold text-[#697391]">Once added, you can switch feeds, posts, and local views from this dropdown.</p>
                <div className="mt-3 flex justify-end gap-2">
                  <button type="button" onClick={() => { setAdding(false); setSecondaryDraft('') }} className="h-10 rounded-[10px] border border-[#D7DFF0] bg-white px-4 text-[12px] font-black text-[#44506E]">
                    Cancel
                  </button>
                  <button type="button" onClick={saveSecondary} disabled={saving} className="flex h-10 items-center gap-2 rounded-[10px] bg-[#075CFF] px-4 text-[12px] font-black text-white disabled:opacity-60">
                    {saving && <Loader2 size={14} className="animate-spin" />}
                    Save
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
