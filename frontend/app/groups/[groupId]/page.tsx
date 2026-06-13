'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, ChevronRight, Loader2, MapPin, MoreVertical, Shield, Trash2, Users, X } from 'lucide-react'
import { getGroup, getGroupMembers, removeGroupMember, updateGroupMember } from '@/lib/api'
import { Group, GroupMember } from '@/types'
import { useAuth } from '@/hooks/useAuth'
import Avatar from '@/components/shared/Avatar'
import { useClickOutside } from '@/hooks/useClickOutside'
import toast from 'react-hot-toast'

const ROLES: GroupMember['role'][] = ['admin', 'moderator', 'member']

export default function GroupDetailsPage() {
  const params = useParams<{ groupId: string }>()
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [group, setGroup] = useState<Group | null>(null)
  const [members, setMembers] = useState<GroupMember[]>([])
  const [loading, setLoading] = useState(true)
  const [savingUserId, setSavingUserId] = useState<string | null>(null)
  const [menuUserId, setMenuUserId] = useState<string | null>(null)
  const [removingUserId, setRemovingUserId] = useState<string | null>(null)
  const memberMenuRef = useRef<HTMLDivElement>(null)

  useClickOutside(memberMenuRef, () => setMenuUserId(null), Boolean(menuUserId))

  useEffect(() => {
    if (authLoading) return
    Promise.all([getGroup(params.groupId), getGroupMembers(params.groupId)])
      .then(([groupRes, membersRes]) => {
        setGroup(groupRes.data.group)
        setMembers(membersRes.data.members ?? [])
      })
      .catch((error: any) => {
        toast.error(error?.response?.data?.message ?? 'Could not load group details')
        router.push('/groups')
      })
      .finally(() => setLoading(false))
  }, [authLoading, params.groupId, router])

  const viewer = useMemo(() => members.find(member => member.user_id === user?.id), [members, user?.id])
  const canManageRoles = viewer?.role === 'admin'

  const openChat = () => {
    if (group?.default_thread_id) router.push(`/groups/${group.id}/threads/${group.default_thread_id}`)
    else toast.error('No chat thread found for this group')
  }

  const openUserProfile = (userId: string) => {
    if (userId === user?.id) router.push('/profile')
    else router.push(`/users/${userId}`)
  }

  const changeRole = async (member: GroupMember, role: GroupMember['role']) => {
    if (!group || member.role === role || savingUserId) return
    if (member.user_id === group.admin_user_id && role !== 'admin') {
      toast.error('Main admin can only be changed by vote')
      return
    }

    setSavingUserId(member.user_id)
    try {
      const res = await updateGroupMember(group.id, member.user_id, { role })
      const updated = res.data.member as GroupMember
      setMembers(prev => prev.map(item => item.user_id === updated.user_id ? updated : item))
      toast.success('Position updated')
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? 'Could not update position')
    } finally {
      setSavingUserId(null)
    }
  }

  const removeMember = async (member: GroupMember) => {
    if (!group || removingUserId) return
    const name = member.user.username ?? member.user.phone
    if (!window.confirm(`Remove ${name} from ${group.name}?`)) return

    setRemovingUserId(member.user_id)
    try {
      await removeGroupMember(group.id, member.user_id)
      setMembers(prev => prev.filter(item => item.user_id !== member.user_id))
      setGroup(prev => prev ? { ...prev, member_count: Math.max(0, prev.member_count - 1) } : prev)
      setMenuUserId(null)
      toast.success('Member removed')
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? 'Could not remove member')
    } finally {
      setRemovingUserId(null)
    }
  }

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#FBFCFF]">
        <Loader2 size={28} className="animate-spin text-[#075CFF]" />
        <p className="mt-4 text-[12px] font-semibold text-[#697391]">Loading group details</p>
      </div>
    )
  }

  if (!group) return null

  return (
    <div className="min-h-screen bg-[#FBFCFF] font-body text-[#081234]">
      <div className="mx-auto max-w-[1120px] px-4 py-6 xl:px-8">
        <button onClick={() => router.push('/groups')} className="mb-5 inline-flex items-center gap-2 text-[13px] font-black text-[#44506E] hover:text-[#075CFF]">
          <ArrowLeft size={18} />
          Back to Groups
        </button>

        <section className="overflow-hidden rounded-[16px] border border-[#DDE5F3] bg-white shadow-[0_18px_44px_rgba(30,56,104,0.07)]">
          <div className="h-[170px] bg-[radial-gradient(circle_at_20%_20%,rgba(7,92,255,0.28),transparent_32%),linear-gradient(135deg,#EAF2FF,#F8FBFF)]">
            {group.cover_image_url && <img src={group.cover_image_url} alt="" className="h-full w-full object-cover" />}
          </div>
          <div className="px-5 pb-5">
            <div className="-mt-14 flex flex-col gap-5 md:flex-row md:items-end">
              <div className="rounded-full border-[5px] border-white bg-white">
                <Avatar name={group.name} src={group.cover_image_url} size={112} className="!rounded-full" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="truncate text-[31px] font-black tracking-[-0.04em]">{group.name}</h1>
                  <span className="rounded-full bg-[#EAF2FF] px-3 py-1 text-[11px] font-black text-[#075CFF]">{group.type.toUpperCase()}</span>
                  {group.admin_user_id === user?.id && <span className="rounded-full bg-[#FFF4E8] px-3 py-1 text-[11px] font-black text-[#F97316]">MAIN ADMIN</span>}
                </div>
                <p className="mt-2 flex flex-wrap items-center gap-3 text-[13px] font-semibold text-[#697391]">
                  <span className="inline-flex items-center gap-1"><MapPin size={14} /> {group.pincode}</span>
                  <span>{group.category}</span>
                  <span>{group.member_count} members</span>
                </p>
                {group.description && <p className="mt-3 max-w-2xl text-[14px] font-semibold leading-relaxed text-[#44506E]">{group.description}</p>}
              </div>
              <button onClick={openChat} className="inline-flex h-11 items-center gap-2 rounded-[9px] bg-[#075CFF] px-5 text-[14px] font-black text-white shadow-[0_12px_28px_rgba(7,92,255,0.16)]">
                Open Chat
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-[16px] border border-[#DDE5F3] bg-white p-5 shadow-[0_18px_44px_rgba(30,56,104,0.07)]">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-[22px] font-black tracking-[-0.03em]">Members and positions</h2>
              <p className="mt-1 text-[13px] font-semibold text-[#697391]">
                {canManageRoles ? 'Admins can assign positions here.' : 'Only admins can assign positions.'}
              </p>
            </div>
            <div className="hidden items-center gap-2 rounded-full bg-[#F1F5FF] px-3 py-2 text-[12px] font-black text-[#075CFF] md:flex">
              <Users size={15} />
              {members.length} members
            </div>
          </div>

          <div className="divide-y divide-[#EDF1F8]">
            {members.map(member => {
              const isMainAdmin = member.user_id === group.admin_user_id
              return (
                <div key={member.user_id} className="grid gap-4 py-4 md:grid-cols-[minmax(0,1fr)_210px] md:items-center">
                  <div className="flex min-w-0 items-center gap-3">
                    <button type="button" onClick={() => openUserProfile(member.user_id)} className="rounded-full focus:outline-none focus:ring-2 focus:ring-[#075CFF]" aria-label="Open user profile">
                      <Avatar name={member.user.username ?? member.user.phone} src={member.user.avatar_url} size={46} className="!rounded-full" />
                    </button>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <button type="button" onClick={() => openUserProfile(member.user_id)} className="truncate text-left text-[15px] font-black hover:text-[#075CFF]">{member.user.username ?? member.user.phone}</button>
                        {isMainAdmin && <Badge tone="orange">Main Admin</Badge>}
                        {!isMainAdmin && member.role === 'admin' && <Badge tone="blue">Admin</Badge>}
                        {member.role === 'moderator' && <Badge tone="green">Moderator</Badge>}
                      </div>
                      <p className="mt-1 text-[12px] font-semibold text-[#697391]">Joined {new Date(member.joined_at).toLocaleDateString('en-IN')}</p>
                    </div>
                  </div>

                  {canManageRoles ? (
                    <div className="flex items-center gap-2">
                      {savingUserId === member.user_id && <Loader2 size={16} className="animate-spin text-[#075CFF]" />}
                      <select
                        value={member.role}
                        disabled={savingUserId === member.user_id || isMainAdmin}
                        onChange={event => changeRole(member, event.target.value as GroupMember['role'])}
                        className="h-10 w-full rounded-[8px] border border-[#D7DFF0] bg-white px-3 text-[13px] font-black text-[#081234] outline-none disabled:cursor-not-allowed disabled:bg-[#F4F7FC] disabled:text-[#8B96B2]"
                      >
                        {ROLES.map(role => <option key={role} value={role}>{roleLabel(role)}</option>)}
                      </select>
                      {!isMainAdmin && member.user_id !== user?.id && (
                        <div ref={menuUserId === member.user_id ? memberMenuRef : undefined} className="relative">
                          <button
                            type="button"
                            onClick={() => setMenuUserId(prev => prev === member.user_id ? null : member.user_id)}
                            className="grid h-10 w-10 place-items-center rounded-[8px] border border-[#D7DFF0] bg-white text-[#44506E] hover:border-[#9CB9FF] hover:text-[#075CFF]"
                            aria-label="Member actions"
                          >
                            {menuUserId === member.user_id ? <X size={16} /> : <MoreVertical size={17} />}
                          </button>
                          {menuUserId === member.user_id && (
                            <div className="absolute right-0 top-12 z-20 w-44 overflow-hidden rounded-[10px] border border-[#F2D0D0] bg-white shadow-2xl">
                              <button
                                type="button"
                                onClick={() => removeMember(member)}
                                disabled={removingUserId === member.user_id}
                                className="flex w-full items-center gap-2 px-3 py-3 text-left text-[12px] font-black text-red-600 hover:bg-red-50 disabled:opacity-60"
                              >
                                {removingUserId === member.user_id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                Remove member
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="inline-flex w-fit items-center gap-2 rounded-[8px] bg-[#F7FAFF] px-3 py-2 text-[13px] font-black text-[#44506E] md:ml-auto">
                      <Shield size={15} />
                      {roleLabel(member.role)}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      </div>
    </div>
  )
}

function roleLabel(role: GroupMember['role']) {
  if (role === 'admin') return 'Admin'
  if (role === 'moderator') return 'Moderator'
  return 'Member'
}

function Badge({ children, tone }: { children: React.ReactNode; tone: 'orange' | 'blue' | 'green' }) {
  const styles = {
    orange: 'bg-[#FFF4E8] text-[#F97316]',
    blue: 'bg-[#EAF2FF] text-[#075CFF]',
    green: 'bg-[#EAF8EF] text-[#16A34A]',
  }
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${styles[tone]}`}>{children}</span>
}
