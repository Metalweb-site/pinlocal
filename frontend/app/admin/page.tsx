'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BarChart3, Ban, Database, Eye, Loader2, Lock, MessageSquare, RefreshCw, Search, Shield, Users, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { connectSocket, disconnectSocket } from '@/lib/socket'
import { banAdminUser, getAdminGroupThreads, getAdminGroups, getAdminOverview, getAdminReports, getAdminThreadMessages, getAdminUserDetail, getAdminUsers, moderateAdminGroup, respondAdminReport } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { timeAgo } from '@/lib/utils'

type AdminOverview = {
  totals: Record<string, number>
  pincodeStats: Array<Record<string, any>>
  recentUsers: Array<Record<string, any>>
  recentGroups: Array<Record<string, any>>
  recentAudit: Array<Record<string, any>>
}

export default function AdminPage() {
  const { loading: authLoading } = useAuth()
  const router = useRouter()
  const [overview, setOverview] = useState<AdminOverview | null>(null)
  const [groups, setGroups] = useState<Array<Record<string, any>>>([])
  const [users, setUsers] = useState<Array<Record<string, any>>>([])
  const [reports, setReports] = useState<Array<Record<string, any>>>([])
  const [threads, setThreads] = useState<Array<Record<string, any>>>([])
  const [members, setMembers] = useState<Array<Record<string, any>>>([])
  const [messages, setMessages] = useState<Array<Record<string, any>>>([])
  const [userDetail, setUserDetail] = useState<Record<string, any> | null>(null)
  const [selectedGroup, setSelectedGroup] = useState<Record<string, any> | null>(null)
  const [selectedThread, setSelectedThread] = useState<Record<string, any> | null>(null)
  const [search, setSearch] = useState('')
  const [pincode, setPincode] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [appliedPincode, setAppliedPincode] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [banDays, setBanDays] = useState(7)
  const [banReason, setBanReason] = useState('')
  const [banning, setBanning] = useState(false)
  const [groupActionReason, setGroupActionReason] = useState('')
  const [reportResponse, setReportResponse] = useState<Record<string, string>>({})

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setRefreshing(true)
    try {
      const [overviewRes, groupsRes, usersRes, reportsRes] = await Promise.all([
        getAdminOverview(),
        getAdminGroups({ pincode: appliedPincode || undefined, search: appliedSearch || undefined }),
        getAdminUsers({ pincode: appliedPincode || undefined, search: appliedSearch || undefined }),
        getAdminReports(),
      ])
      setOverview(overviewRes.data)
      setGroups(groupsRes.data.groups ?? [])
      setUsers(usersRes.data.users ?? [])
      setReports(reportsRes.data.reports ?? [])
    } catch (error: any) {
      if (error?.response?.status === 403) {
        toast.error('Super admin access required')
        router.push('/feed')
      } else {
        toast.error(error?.response?.data?.message ?? 'Could not load admin dashboard')
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [appliedPincode, appliedSearch, router])

  const applyFilters = () => {
    const nextPincode = pincode.trim()
    if (nextPincode && nextPincode.length !== 6) {
      toast.error('Enter full 6-digit pincode or leave it empty')
      return
    }
    setAppliedSearch(search.trim())
    setAppliedPincode(nextPincode)
  }

  const resetFilters = () => {
    setSearch('')
    setPincode('')
    setAppliedSearch('')
    setAppliedPincode('')
  }

  useEffect(() => {
    if (!authLoading) load()
  }, [authLoading, load])

  useEffect(() => {
    const socket = connectSocket()
    const refresh = () => load(true)
    socket.on('post_counts_updated', refresh)
    socket.on('admin_audit_created', refresh)
    const timer = setInterval(refresh, 5000)
    return () => {
      socket.off('post_counts_updated', refresh)
      socket.off('admin_audit_created', refresh)
      clearInterval(timer)
      disconnectSocket()
    }
  }, [load])

  const openGroup = async (group: Record<string, any>) => {
    setSelectedGroup(group)
    setSelectedThread(null)
    setMessages([])
    try {
      const res = await getAdminGroupThreads(group.id)
      setThreads(res.data.threads ?? [])
      setMembers(res.data.members ?? [])
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? 'Could not load group threads')
    }
  }

  const openUser = async (userId: string) => {
    try {
      const res = await getAdminUserDetail(userId)
      setUserDetail(res.data)
      setBanReason('')
      setBanDays(7)
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? 'Could not load user details')
    }
  }

  const banUser = async () => {
    if (!userDetail?.user?.id) return
    if (banReason.trim().length < 10) {
      toast.error('Write a clear reason, at least 10 characters')
      return
    }

    setBanning(true)
    try {
      await banAdminUser(userDetail.user.id, { days: banDays, reason: banReason.trim() })
      toast.success('User banned and notified')
      await openUser(userDetail.user.id)
      load(true)
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? 'Could not ban user')
    } finally {
      setBanning(false)
    }
  }

  const moderateGroup = async (status: 'active' | 'suspended' | 'banned') => {
    if (!selectedGroup?.id) return
    if (status !== 'active' && groupActionReason.trim().length < 10) {
      toast.error('Write a reason for this group action')
      return
    }
    try {
      await moderateAdminGroup(selectedGroup.id, { status, reason: groupActionReason.trim() || 'Restored by admin' })
      toast.success(`Group ${status}`)
      setGroupActionReason('')
      load(true)
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? 'Could not moderate group')
    }
  }

  const respondReport = async (reportId: string, status: 'reviewed' | 'actioned' | 'dismissed') => {
    const response = reportResponse[reportId]?.trim()
    if (!response || response.length < 5) {
      toast.error('Write a response for the reporter')
      return
    }
    try {
      await respondAdminReport(reportId, { status, response })
      toast.success('Reporter notified')
      setReportResponse(prev => ({ ...prev, [reportId]: '' }))
      load(true)
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? 'Could not respond to report')
    }
  }

  const openThread = async (thread: Record<string, any>) => {
    setSelectedThread(thread)
    try {
      const res = await getAdminThreadMessages(thread.id)
      setMessages(res.data.messages ?? [])
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? 'Could not load messages')
    }
  }

  if (authLoading || loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-bg">
        <Loader2 size={30} className="animate-spin text-coral" />
      </div>
    )
  }

  const totals = overview?.totals ?? {}

  return (
    <div className="min-h-screen bg-bg text-text1">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-bg/70 px-5 py-4 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-coral">
              <Shield size={15} /> Super Admin
            </div>
            <h1 className="font-display text-[40px] font-black uppercase leading-none">PinLocal Control</h1>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text3" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') applyFilters() }}
                placeholder="Search users or groups"
                className="h-11 w-full rounded-[8px] border border-white/10 bg-white/[0.05] pl-9 pr-3 text-sm outline-none focus:border-coral sm:w-64"
              />
            </div>
            <input
              value={pincode}
              onChange={(e) => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={(e) => { if (e.key === 'Enter') applyFilters() }}
              placeholder="Pincode"
              className="h-11 rounded-[8px] border border-white/10 bg-white/[0.05] px-3 text-sm outline-none focus:border-coral sm:w-32"
            />
            <button
              onClick={applyFilters}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-[8px] bg-coral px-4 text-sm font-black text-white"
            >
              <Search size={15} /> Search
            </button>
            <button
              onClick={resetFilters}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-[8px] border border-white/10 bg-white/[0.05] px-4 text-sm font-black text-text2"
            >
              Reset
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-5 py-6">
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            ['Users', totals.users, Users],
            ['Active 24h', totals.active_24h, BarChart3],
            ['Groups', totals.groups, Database],
            ['Posts', totals.posts, Eye],
            ['Messages', totals.messages, MessageSquare],
          ].map(([label, value, Icon]: any) => (
            <div key={label} className="rounded-[8px] border border-white/10 bg-white/[0.05] p-4">
              <Icon size={18} className="mb-4 text-coral" />
              <div className="text-[11px] font-black uppercase tracking-[0.14em] text-text3">{label}</div>
              <div className="mt-1 font-display text-3xl font-black">{value ?? 0}</div>
            </div>
          ))}
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          {[
            ['Open groups', totals.open_groups],
            ['Private groups', totals.private_groups],
            ['Secret groups', totals.secret_groups],
            ['Comments', totals.comments],
            ['Likes', totals.likes],
            ['Pending reports', totals.pending_reports],
          ].map(([label, value]) => (
            <div key={label} className="rounded-[8px] border border-white/10 bg-white/[0.035] p-4">
              <div className="text-[11px] font-black uppercase tracking-[0.14em] text-text3">{label}</div>
              <div className="mt-1 text-2xl font-black">{value ?? 0}</div>
            </div>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[8px] border border-white/10 bg-white/[0.04]">
            <div className="border-b border-white/10 p-4">
              <h2 className="font-display text-2xl font-black uppercase">Pincode health</h2>
            </div>
            <div className="max-h-[360px] overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-[#111] text-[10px] uppercase tracking-[0.16em] text-text3">
                  <tr>
                    <th className="p-3">Pincode</th>
                    <th className="p-3">Users</th>
                    <th className="p-3">Groups</th>
                    <th className="p-3">Open</th>
                    <th className="p-3">Private</th>
                    <th className="p-3">Posts</th>
                  </tr>
                </thead>
                <tbody>
                  {(overview?.pincodeStats ?? []).map(row => (
                    <tr key={row.pincode} className="border-t border-white/5">
                      <td className="p-3 font-mono font-bold text-coral">{row.pincode}</td>
                      <td className="p-3">{row.users}</td>
                      <td className="p-3">{row.groups}</td>
                      <td className="p-3">{row.open_groups}</td>
                      <td className="p-3">{row.private_groups}</td>
                      <td className="p-3">{row.posts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-[8px] border border-white/10 bg-white/[0.04] p-4">
            <h2 className="font-display text-2xl font-black uppercase">Audit trail</h2>
            <p className="mb-4 mt-1 text-[12px] text-text3">Sensitive admin access is logged here.</p>
            <div className="space-y-2">
              {(overview?.recentAudit ?? []).map(item => (
                <div key={item.id} className="rounded-[8px] border border-white/10 bg-black/20 p-3">
                  <div className="text-sm font-bold">{item.action}</div>
                  <div className="mt-1 text-[11px] text-text3">{item.target_type ?? 'system'} - {timeAgo(item.created_at)}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <Panel title="Reports">
            {reports.map(report => (
              <div key={report.id} className="rounded-[8px] border border-white/10 bg-white/[0.035] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-bold uppercase">{report.content_type} report</div>
                  <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] text-text3">{report.status}</span>
                </div>
                <div className="mt-1 text-[12px] text-text3">Reported by {report.reporter?.username || report.reporter?.phone} - {timeAgo(report.created_at)}</div>
                <div className="mt-3 rounded-[8px] border border-coral/20 bg-coral/5 p-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.14em] text-coral">Reporter said</div>
                  <p className="mt-1 text-sm">{report.description || report.reason}</p>
                </div>
                <ReportContent report={report} onUser={openUser} />
                <textarea
                  value={reportResponse[report.id] ?? ''}
                  onChange={(e) => setReportResponse(prev => ({ ...prev, [report.id]: e.target.value }))}
                  placeholder="Write what action you took for the reporter..."
                  className="mt-3 w-full rounded-[8px] border border-white/10 bg-white/[0.05] p-2 text-sm outline-none focus:border-coral"
                  rows={3}
                />
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <button onClick={() => respondReport(report.id, 'reviewed')} className="h-9 rounded-[8px] bg-white/[0.06] text-xs font-bold">Reviewed</button>
                  <button onClick={() => respondReport(report.id, 'actioned')} className="h-9 rounded-[8px] bg-coral text-xs font-bold text-white">Actioned</button>
                  <button onClick={() => respondReport(report.id, 'dismissed')} className="h-9 rounded-[8px] bg-white/[0.06] text-xs font-bold">Dismiss</button>
                </div>
              </div>
            ))}
          </Panel>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <Panel title="Groups">
            {groups.map(group => (
              <button key={group.id} onClick={() => openGroup(group)} className="w-full rounded-[8px] border border-white/10 bg-white/[0.035] p-3 text-left hover:border-coral/50">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-bold">{group.name}</div>
                    <div className="mt-1 text-[12px] text-text3">{group.pincode} - {group.type} - {group.active_members} members</div>
                  </div>
                  <Eye size={16} className="text-text3" />
                </div>
              </button>
            ))}
          </Panel>

          <Panel title="Users">
            {users.map(user => (
              <button key={user.id} onClick={() => openUser(user.id)} className="w-full rounded-[8px] border border-white/10 bg-white/[0.035] p-3 text-left hover:border-coral/50">
                <div className="font-bold">{user.username || user.phone}</div>
                <div className="mt-1 text-[12px] text-text3">{user.phone} - {user.primary_pincode} - {user.group_count} groups - {user.post_count} posts</div>
              </button>
            ))}
          </Panel>
        </section>

        {selectedGroup && (
          <section className="grid gap-6 lg:grid-cols-3">
            <Panel title={`Threads in ${selectedGroup.name}`}>
              <div className="rounded-[8px] border border-red-400/20 bg-red-400/5 p-3">
                <div className="mb-2 text-[11px] font-black uppercase tracking-[0.14em] text-red-200">Group moderation</div>
                <textarea value={groupActionReason} onChange={(e) => setGroupActionReason(e.target.value)} placeholder="Reason for suspend/ban..." className="mb-2 w-full rounded-[8px] border border-white/10 bg-black/20 p-2 text-sm outline-none" rows={2} />
                <div className="grid grid-cols-3 gap-2">
                  <button onClick={() => moderateGroup('active')} className="h-9 rounded-[8px] bg-white/[0.08] text-xs font-bold">Restore</button>
                  <button onClick={() => moderateGroup('suspended')} className="h-9 rounded-[8px] bg-yellow-500/80 text-xs font-bold text-bg">Suspend</button>
                  <button onClick={() => moderateGroup('banned')} className="h-9 rounded-[8px] bg-red-500 text-xs font-bold text-white">Ban</button>
                </div>
              </div>
              {threads.map(thread => (
                <button key={thread.id} onClick={() => openThread(thread)} className="w-full rounded-[8px] border border-white/10 bg-white/[0.035] p-3 text-left hover:border-coral/50">
                  <div className="font-bold">#{thread.name}</div>
                  <div className="mt-1 text-[12px] text-text3">{thread.message_count} messages</div>
                </button>
              ))}
            </Panel>

            <Panel title="Group Members">
              {members.map(member => (
                <button key={member.user_id} onClick={() => openUser(member.user_id)} className="w-full rounded-[8px] border border-white/10 bg-white/[0.035] p-3 text-left hover:border-coral/50">
                  <div className="font-bold">{member.user?.username || member.user?.phone}</div>
                  <div className="mt-1 text-[12px] text-text3">{member.role} - {member.status}</div>
                </button>
              ))}
            </Panel>

            <Panel title={selectedThread ? `Messages in #${selectedThread.name}` : 'Messages'}>
              {!selectedThread ? (
                <div className="rounded-[8px] border border-white/10 bg-white/[0.035] p-6 text-center text-sm text-text3">
                  Select a thread to inspect messages. Access is audit logged.
                </div>
              ) : (
                messages.map(message => (
                  <div key={message.id} className="rounded-[8px] border border-white/10 bg-black/20 p-3">
                    <div className="mb-1 flex items-center justify-between gap-3 text-[11px] text-text3">
                      <button onClick={() => message.sender?.id && openUser(message.sender.id)} className="hover:text-coral">
                        {message.sender?.username || message.sender?.phone || 'Unknown'}
                      </button>
                      <span>{timeAgo(message.created_at)}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm">{message.is_deleted ? '[deleted]' : (message.content || message.media_url || '[media]')}</p>
                  </div>
                ))
              )}
            </Panel>
          </section>
        )}

        <div className="rounded-[8px] border border-yellow-400/20 bg-yellow-400/5 p-4 text-sm text-yellow-100">
          <Lock size={16} className="mb-2" />
          This panel is for platform safety, support, and operations. Sensitive inspections are logged in the admin audit trail.
        </div>
      </main>

      {userDetail && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-4 py-6 backdrop-blur-sm lg:items-center">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-[8px] border border-white/10 bg-[#111] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 p-4">
              <div>
                <h2 className="font-display text-2xl font-black uppercase">{userDetail.user?.username || userDetail.user?.phone}</h2>
                <p className="mt-1 text-[12px] text-text3">{userDetail.user?.phone} - {userDetail.user?.primary_pincode}</p>
              </div>
              <button onClick={() => setUserDetail(null)} className="grid h-10 w-10 place-items-center rounded-full border border-white/10 text-text3 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="grid max-h-[calc(90vh-74px)] gap-4 overflow-auto p-4 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-4">
                <DetailBlock title="User Details">
                  <div className="grid gap-2 text-sm sm:grid-cols-2">
                    <Info label="Phone" value={userDetail.user?.phone} />
                    <Info label="Pincode" value={userDetail.user?.primary_pincode} />
                    <Info label="Created" value={new Date(userDetail.user?.created_at).toLocaleString()} />
                    <Info label="Last seen" value={new Date(userDetail.user?.last_seen).toLocaleString()} />
                  </div>
                </DetailBlock>

                <DetailBlock title="Groups">
                  {(userDetail.groups ?? []).map((group: any) => (
                    <div key={group.id} className="rounded-[8px] border border-white/10 bg-white/[0.03] p-3 text-sm">
                      <b>{group.name}</b>
                      <div className="text-[12px] text-text3">{group.pincode} - {group.type} - {group.role} - {group.status}</div>
                    </div>
                  ))}
                </DetailBlock>

                <DetailBlock title="Recent Messages">
                  {(userDetail.messages ?? []).map((message: any) => (
                    <div key={message.id} className="rounded-[8px] border border-white/10 bg-white/[0.03] p-3 text-sm">
                      <div className="mb-1 text-[11px] text-text3">{message.group_name} / #{message.thread_name} - {timeAgo(message.created_at)}</div>
                      <p>{message.is_deleted ? '[deleted]' : (message.content || '[media]')}</p>
                    </div>
                  ))}
                </DetailBlock>
              </div>

              <div className="space-y-4">
                <DetailBlock title="Ban User">
                  <label className="mb-2 block text-[11px] font-black uppercase tracking-[0.14em] text-text3">Duration</label>
                  <select value={banDays} onChange={(e) => setBanDays(Number(e.target.value))} className="mb-3 h-11 w-full rounded-[8px] border border-white/10 bg-[#171717] px-3 text-sm outline-none">
                    <option value={1}>1 day</option>
                    <option value={3}>3 days</option>
                    <option value={7}>7 days</option>
                    <option value={30}>30 days</option>
                    <option value={90}>90 days</option>
                    <option value={365}>1 year</option>
                  </select>
                  <label className="mb-2 block text-[11px] font-black uppercase tracking-[0.14em] text-text3">Reason shown to user</label>
                  <textarea value={banReason} onChange={(e) => setBanReason(e.target.value)} rows={5} maxLength={1000} className="w-full rounded-[8px] border border-white/10 bg-white/[0.05] p-3 text-sm outline-none focus:border-coral" placeholder="Explain exactly why this account is restricted..." />
                  <button onClick={banUser} disabled={banning} className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-[8px] bg-red-500 px-4 text-sm font-black text-white disabled:opacity-60">
                    {banning ? <Loader2 size={16} className="animate-spin" /> : <Ban size={16} />}
                    Ban user
                  </button>
                </DetailBlock>

                <DetailBlock title="Sanction History">
                  {(userDetail.sanctions ?? []).map((s: any) => (
                    <div key={s.id} className="rounded-[8px] border border-white/10 bg-white/[0.03] p-3 text-sm">
                      <div className="font-bold uppercase">{s.type} - {s.scope}</div>
                      <div className="text-[12px] text-text3">Until {s.expires_at ? new Date(s.expires_at).toLocaleString() : 'forever'}</div>
                      <p className="mt-2 text-text2">{s.reason}</p>
                    </div>
                  ))}
                </DetailBlock>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[8px] border border-white/10 bg-white/[0.04]">
      <div className="border-b border-white/10 p-4">
        <h2 className="font-display text-2xl font-black uppercase">{title}</h2>
      </div>
      <div className="max-h-[440px] space-y-2 overflow-auto p-3">{children}</div>
    </div>
  )
}

function ReportContent({ report, onUser }: { report: Record<string, any>; onUser: (id: string) => void }) {
  const content = report.content ?? {}
  const actor = content.sender ?? content.author ?? content.admin ?? (report.content_type === 'user' ? content : null)
  const group = content.group
  const text = content.text || content.description || content.name || '[No text content]'

  return (
    <div className="mt-3 rounded-[8px] border border-white/10 bg-black/25 p-3">
      <div className="mb-3 grid gap-2 text-[12px] sm:grid-cols-2">
        {actor?.id && (
          <button onClick={() => onUser(actor.id)} className="rounded-[8px] border border-white/10 bg-white/[0.04] p-2 text-left hover:border-coral/50">
            <div className="text-[9px] font-black uppercase tracking-[0.14em] text-text3">
              {report.content_type === 'message' ? 'Sender' : report.content_type === 'group' ? 'Group Admin' : 'Author'}
            </div>
            <div className="mt-1 font-bold">{actor.username || actor.phone}</div>
            <div className="text-text3">{actor.phone}</div>
          </button>
        )}

        {group && (
          <div className="rounded-[8px] border border-white/10 bg-white/[0.04] p-2">
            <div className="text-[9px] font-black uppercase tracking-[0.14em] text-text3">Group Context</div>
            <div className="mt-1 font-bold">{group.name}</div>
            <div className="text-text3">{group.pincode} - {group.type} - {group.status ?? 'active'}</div>
          </div>
        )}

        {content.thread && (
          <div className="rounded-[8px] border border-white/10 bg-white/[0.04] p-2">
            <div className="text-[9px] font-black uppercase tracking-[0.14em] text-text3">Thread</div>
            <div className="mt-1 font-bold">#{content.thread.name}</div>
          </div>
        )}

        {(content.created_at || report.created_at) && (
          <div className="rounded-[8px] border border-white/10 bg-white/[0.04] p-2">
            <div className="text-[9px] font-black uppercase tracking-[0.14em] text-text3">Content Time</div>
            <div className="mt-1 font-bold">{content.created_at ? new Date(content.created_at).toLocaleString() : timeAgo(report.created_at)}</div>
          </div>
        )}
      </div>

      <div className="rounded-[8px] border border-white/10 bg-white/[0.04] p-3">
        <div className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-text3">
          Reported {report.content_type}
        </div>
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{text}</p>
      </div>
    </div>
  )
}

function DetailBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[8px] border border-white/10 bg-white/[0.04] p-4">
      <h3 className="mb-3 text-[12px] font-black uppercase tracking-[0.16em] text-coral">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-[8px] border border-white/10 bg-black/20 p-3">
      <div className="text-[10px] font-black uppercase tracking-[0.14em] text-text3">{label}</div>
      <div className="mt-1 break-words text-sm font-bold">{value || '-'}</div>
    </div>
  )
}
