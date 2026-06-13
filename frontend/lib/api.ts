import axios from 'axios'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'
let pendingRequests = 0

const emitLoading = (type: 'start' | 'end') => {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(`pinlocal:loading-${type}`))
}

const beginRequest = () => {
  pendingRequests += 1
  if (pendingRequests === 1) emitLoading('start')
}

const endRequest = () => {
  pendingRequests = Math.max(0, pendingRequests - 1)
  if (pendingRequests === 0) emitLoading('end')
}

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use(
  (config) => {
    beginRequest()
    return config
  },
  (err) => {
    endRequest()
    return Promise.reject(err)
  }
)

api.interceptors.response.use(
  (res) => {
    endRequest()
    return res
  },
  async (err) => {
    endRequest()
    if (err.response?.status === 401 && err.response?.data?.error === 'token_expired') {
      try {
        await axios.post(
          `${API_BASE_URL}/auth/refresh`,
          {},
          { withCredentials: true }
        )
        return api.request(err.config)
      } catch {
        if (typeof window !== 'undefined') window.location.href = '/auth/login'
      }
    }
    return Promise.reject(err)
  }
)

export default api

// Auth
export const sendOtp   = (phone: string) => api.post('/auth/send-otp', { phone })
export const verifyOtp = (phone: string, code: string) => api.post('/auth/verify-otp', { phone, code })
export const verifyPasscode = (passcode_token: string, passcode: string) =>
  api.post('/auth/verify-passcode', { passcode_token, passcode })
export const logout    = () => api.post('/auth/logout')
export const getMe     = () => api.get('/users/me')
export const updateMe  = (data: object) => api.patch('/users/me', data)
export const setPasscode = (passcode: string) => api.patch('/users/me/passcode', { passcode })
export const detectPincode = (lat: number, lng: number) =>
  api.get(`/users/detect-pincode?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`)
export const getBadges = () => api.get('/users/badges')
export const getProfileStats = () => api.get('/users/me/stats')
export const getConnections = () => api.get('/users/me/connections')
export const getMyPosts = (page = 1) => api.get('/users/me/posts', { params: { page } })
export const searchUsers = (q: string) => api.get('/users/search', { params: { q } })
export const getPublicProfile = (id: string) => api.get(`/users/${id}/public`)
export const followUser = (id: string) => api.post(`/users/${id}/follow`)
export const unfollowUser = (id: string) => api.delete(`/users/${id}/follow`)
export const getSavedPosts = (page = 1) => api.get('/users/me/saved-posts', { params: { page } })
export const getUserActivity = (page = 1) => api.get('/users/me/activity', { params: { page } })

// Super admin
export const getAdminOverview = () => api.get('/admin/overview')
export const getAdminReports = () => api.get('/admin/reports')
export const respondAdminReport = (reportId: string, data: { status: string; response: string }) =>
  api.patch(`/admin/reports/${reportId}`, data)
export const getAdminGroups = (params?: { pincode?: string; type?: string; search?: string }) =>
  api.get('/admin/groups', { params })
export const getAdminUsers = (params?: { pincode?: string; search?: string }) =>
  api.get('/admin/users', { params })
export const getAdminUserDetail = (userId: string) => api.get(`/admin/users/${userId}`)
export const banAdminUser = (userId: string, data: { days: number; reason: string }) =>
  api.post(`/admin/users/${userId}/ban`, data)
export const getAdminGroupThreads = (groupId: string) => api.get(`/admin/groups/${groupId}/threads`)
export const getAdminThreadMessages = (threadId: string) => api.get(`/admin/threads/${threadId}/messages`)
export const moderateAdminGroup = (groupId: string, data: { status: string; reason: string }) =>
  api.post(`/admin/groups/${groupId}/moderate`, data)
export const reportContent = (data: { content_type: string; content_id: string; reason: string; description?: string }) =>
  api.post('/reports', data)

// Notifications
export const getNotifications = (page = 1, limit = 10) =>
  api.get('/notifications', { params: { page, limit } })
export const markNotificationsRead = (ids: string[]) =>
  api.patch('/notifications/read', { ids })
export const markAllNotificationsRead = () => api.patch('/notifications/read-all')
export const getNotificationSettings = () => api.get('/notifications/settings')
export const updateNotificationSettings = (data: object) => api.patch('/notifications/settings', data)
export const updateGroupNotificationPreference = (groupId: string, preference: 'all' | 'muted') =>
  api.patch(`/notifications/settings/groups/${groupId}`, { preference })
export const updateChatNotificationPreference = (conversationId: string, preference: 'all' | 'muted') =>
  api.patch(`/notifications/settings/chats/${conversationId}`, { preference })

// Feed
export const getFeed = (page = 1, category = 'all') =>
  api.get('/feed', { params: { page, category } })

// Groups
export const createGroup   = (data: object) => api.post('/groups', data)
export const getGroup      = (id: string)   => api.get(`/groups/${id}`)
export const joinGroup     = (id: string, data?: object) => api.post(`/groups/${id}/join`, data ?? {})
export const leaveGroup    = (id: string)   => api.post(`/groups/${id}/leave`)
export const getGroupMembers = (id: string) => api.get(`/groups/${id}/members`)
export const updateGroupMember = (groupId: string, userId: string, data: object) =>
  api.patch(`/groups/${groupId}/members/${userId}`, data)
export const removeGroupMember = (groupId: string, userId: string) =>
  api.delete(`/groups/${groupId}/members/${userId}`)
export const getGroupAdminVote = (groupId: string) => api.get(`/groups/${groupId}/admin-vote`)
export const getGroupAdminVotes = (groupId: string) => api.get(`/groups/${groupId}/admin-votes`)
export const startGroupAdminVote = (groupId: string) => api.post(`/groups/${groupId}/admin-vote`)
export const castGroupAdminVote = (groupId: string, voteId: string, choice: 'yes' | 'no') =>
  api.post(`/groups/${groupId}/admin-vote/${voteId}/ballot`, { choice })
export const updateGroup   = (id: string, data: object) => api.patch(`/groups/${id}`, data)
export const getMyGroups   = () => api.get('/groups/mine')

// Threads
export const getThreads    = (groupId: string) => api.get(`/groups/${groupId}/threads`)
export const createThread  = (groupId: string, name: string) =>
  api.post(`/groups/${groupId}/threads`, { name })

// Messages
export const getMessages   = (threadId: string, before?: string) =>
  api.get(`/threads/${threadId}/messages${before ? `?before=${before}` : ''}`)
export const sendMessage   = (threadId: string, data: { content?: string; media_url?: string; media_asset_id?: string; reply_to_id?: string | null }) =>
  api.post(`/threads/${threadId}/messages`, data)
export const deleteMessage = (msgId: string) => api.delete(`/messages/${msgId}`)
export const reactToMessage = (msgId: string, emoji: string) => api.post(`/messages/${msgId}/reactions`, { emoji })

// Personal chats
export const getPersonalChats = () => api.get('/chats')
export const searchChatUsers = (q: string) => api.get('/chats/users/search', { params: { q } })
export const startPersonalChat = (data: { user_id?: string; phone?: string; username?: string }) =>
  api.post('/chats/start', data)
export const getPersonalMessages = (conversationId: string, before?: string) =>
  api.get(`/chats/${conversationId}/messages${before ? `?before=${before}` : ''}`)
export const sendPersonalMessage = (conversationId: string, data: { content?: string; media_url?: string; media_asset_id?: string }) =>
  api.post(`/chats/${conversationId}/messages`, data)
export const markPersonalChatRead = (conversationId: string) => api.patch(`/chats/${conversationId}/read`)

// Posts
export type CreatePostPayload = {
  group_id: string
  content_text?: string
  media_urls?: string[]
  media_asset_ids?: string[]
  category?: string
  hashtags?: string[]
}

export const createPost    = (data: CreatePostPayload) => api.post('/posts', data)
export const likePost      = (id: string)   => api.post(`/posts/${id}/like`)
export const savePost      = (id: string)   => api.post(`/posts/${id}/save`)
export const sharePost     = (id: string)   => api.post(`/posts/${id}/share`)
export const getPostComments = (id: string) => api.get(`/posts/${id}/comments`)
export const createComment = (id: string, content: string) =>
  api.post(`/posts/${id}/comments`, { content })
export const deletePost    = (id: string)   => api.delete(`/posts/${id}`)

export type MediaUploadResponse = {
  asset_id: string
  url: string
  original_url: string
  processed_url: string | null
  thumbnail_url: string | null
  media_type: 'image' | 'video'
  mime_type: string
  size_bytes: number
  duration_seconds: number | null
  width: number | null
  height: number | null
  status: 'uploaded' | 'processing' | 'ready' | 'failed' | 'rejected'
  moderation_status: 'pending' | 'approved' | 'rejected' | 'review'
  error_message?: string | null
}

// Media
export const uploadMedia = (file: File, onProgress?: (percent: number) => void) => {
  const form = new FormData()
  form.append('file', file)
  return api.post<MediaUploadResponse>('/media/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: event => {
      if (!onProgress) return
      const total = event.total || file.size || 1
      onProgress(Math.min(100, Math.round((event.loaded * 100) / total)))
    },
  })
}

export const getMediaAsset = (id: string) => api.get<MediaUploadResponse>(`/media/${id}`)
