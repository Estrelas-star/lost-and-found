import { computed, ref } from 'vue'
import { login as apiLogin, logout as apiLogout, getMe, createUser, updateUser, getQQCode, bindQQ as bindQQApi } from '../api/user'
import {
  listItems, getItem, listTags, listLocations, listMyItems, getItemCount,
  updateItem as updateItemApi, deleteItem as deleteItemApi, closeItem as closeItemApi,
  claimItem, cancelClaim, confirmItem,
  listReports, reviewReport as reviewReportApi,
  type ReportDTO, type ListReportsParams, type TagDTO, type LocationDTO, type ListItemsParams, type ItemDTO,
} from '../api/item'
import { setAuth, clearAuth, getToken, getStoredUser } from '../utils/auth'
import type { UserResponse } from '../api/types'
import { createComment, listComments } from '../api/comment'
import type { CommentDTO } from '../api/comment'
import {
  getNotifications, getUnreadCount, getNotificationDetail,
  markNotificationsRead as markReadApi, deleteNotifications as deleteApi, adminBroadcast,
} from '../api/notification'
import type { NotificationItem, NotificationDetail } from '../api/notification'
import { getAnnouncements } from '../api/announcement'
import type { AnnouncementItem } from '../api/announcement'

import { defineStore } from 'pinia'

export type Role = 'student' | 'itemAdmin' | 'systemAdmin'
export type ItemType = 'lost' | 'found'
export type ItemStatus = '待审核' | '招领中' | '待认领' | '已认领' | '已驳回' | '已关闭'

export interface User {
  name: string
  id: string
  label: string
}

export interface Item {
  id: number
  type: ItemType
  title: string
  tags: string[]
  location: string
  locationId?: number      // 后端地点链末位(叶子)的 id，编辑时回传 location_id
  locationDetail?: string  // 详细地点信息（自由文本，对应后端的 location_detail）
  date: string
  status: ItemStatus
  author: string
  color: string
  icon: string
  desc: string
  contact?: string
  images?: string[]
  claimedBy?: number      // 后端认领人 user_id（若后端返回）；"我是否认领"优先以此判定，否则回退本地缓存
}

export interface Claim {
  id: number
  item: string
  applicant: string
  date: string
  status: string
}

export interface Comment {
  id: number
  itemId: number
  author: string
  avatar: string
  date: string
  content: string
  parentId?: number
  replyTo?: string
}

const users: Record<Role, User> = {
  student: { name: '林知夏', id: '2023010218', label: '普通学生' },
  itemAdmin: { name: '赵老师', id: 'LF-ADMIN-01', label: '失物招领管理员' },
  systemAdmin: { name: '陈老师', id: 'SYS-ADMIN-01', label: '系统管理员' }
}

// 后端 role(数字) <-> 前端 Role(字符串) 映射
const roleMap: Record<number, Role> = { 0: 'student', 1: 'itemAdmin', 2: 'systemAdmin' }
const roleLabelMap: Record<Role, string> = {
  student: '普通学生',
  itemAdmin: '失物招领管理员',
  systemAdmin: '系统管理员',
}

export const useAppStore = defineStore('app', () => {
  const role = ref<Role>((localStorage.getItem('role') as Role) || 'student')
  const activeRoute = ref('home')
  const isAuthenticated = ref(!!getToken())
  // 公开公告（真实接口 GET /announcement，仅已发布）：首页公告条 + 公告管理页共用
  const notices = ref<AnnouncementItem[]>([])
  async function fetchNotices(params: { page?: number; page_size?: number } = {}) {
    try {
      const res = await getAnnouncements({ page: 1, page_size: 20, ...params })
      const list = res.data?.announcements ?? []
      // 置顶优先，其次按 id 倒序（后端已按 id 倒序返回）
      notices.value = [...list].sort((a, b) => (b.is_top - a.is_top) || (b.id - a.id))
    } catch { /* 拉取失败不影响首页 */ }
  }
  // 首页公告条展示的最新一条（无公告时为 null）
  const latestNotice = computed(() => notices.value[0] ?? null)

  // —— 公告「×」关闭 / 「已看」记录（公告无服务端已读接口，前端用 localStorage 记忆）——
  const DISMISSED_KEY = 'lnf-dismissed-notices'
  const READ_KEY = 'lnf-read-notices'
  function loadIdList(key: string): number[] {
    try {
      const arr = JSON.parse(localStorage.getItem(key) || '[]')
      return Array.isArray(arr) ? arr.filter((x) => typeof x === 'number') : []
    } catch { return [] }
  }
  function saveIdList(key: string, ids: number[]) {
    try { localStorage.setItem(key, JSON.stringify(ids)) } catch { /* 忽略 */ }
  }
  // 首页公告条点过「×」的公告：不再出现在首页，但公告栏里始终保留
  const dismissedNoticeIds = ref<number[]>(loadIdList(DISMISSED_KEY))
  function dismissNotice(id: number) {
    if (dismissedNoticeIds.value.includes(id)) return
    dismissedNoticeIds.value = [...dismissedNoticeIds.value, id]
    saveIdList(DISMISSED_KEY, dismissedNoticeIds.value)
  }
  // 首页公告条只提醒「最新一条」公告（置顶优先，见 fetchNotices 的排序）：
  // 被「×」关闭后首页不再显示，等有更新的公告出现才会再提醒；历史公告始终可在顶栏公告栏回看
  const homeNotice = computed(() => {
    const first = notices.value[0] ?? null
    return first && !dismissedNoticeIds.value.includes(first.id) ? first : null
  })
  // 顶栏公告栏的「已看」记录，用于红点角标
  const readNoticeIds = ref<number[]>(loadIdList(READ_KEY))
  function markNoticeRead(id: number) {
    if (readNoticeIds.value.includes(id)) return
    readNoticeIds.value = [...readNoticeIds.value, id]
    saveIdList(READ_KEY, readNoticeIds.value)
  }
  function markAllNoticesRead() {
    readNoticeIds.value = notices.value.map((n) => n.id)
    saveIdList(READ_KEY, readNoticeIds.value)
  }
  const unreadNoticeCount = computed(() => notices.value.filter((n) => !readNoticeIds.value.includes(n.id)).length)
  const items = ref<Item[]>([])
  // —— 本地存储审计（L1）：除 jwt-token(auth) 外，前端仅以下本地状态需要关注 ——
  //   • role：登录时由服务端同步（setRole(roleMap[user.role])），仅作未登录兜底展示，非关键决策源
  //   其余 favoriteItemIds/likedItemIds 等均为内存态，不落盘。 catch { return [] } }
  const favoriteItemIds = ref<number[]>([])
  const likedItemIds = ref<number[]>([])
  const comments = ref<Comment[]>([
    { id: 1, itemId: 1, author: '林知夏', avatar: '林', date: '今天 09:24', content: '请问是在图书馆哪一侧的自习区找到的呢？' },
    { id: 2, itemId: 1, author: '李同学', avatar: '李', date: '今天 09:31', content: '是在三楼靠窗的位置，已经交给服务台了。', parentId: 1, replyTo: '林知夏' },
    { id: 3, itemId: 2, author: '周同学', avatar: '周', date: '昨天 18:42', content: '如果有看到蓝色帆布包，麻烦帮忙留意一下，谢谢！' }
  ])

  // 后端 CommentDTO 只返回 user_id，不返回昵称/头像（model/advanced/comment.go）；
  // 故作者暂以“用户#id”标识，待后端在 CommentDTO 补充 nickname/avatar 字段即可直接显示真实昵称。
  function formatCommentDate(iso: string): string {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return iso
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const hm = pad(d.getHours()) + ':' + pad(d.getMinutes())
    if (d.toDateString() === now.toDateString()) return '今天 ' + hm
    return pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + hm
  }
  function mapToComment(dto: CommentDTO): Comment {
    return {
      id: dto.id,
      itemId: dto.item_id,
      author: '用户#' + dto.user_id,
      avatar: String(dto.user_id).slice(-1) || 'U',
      date: formatCommentDate(dto.created_at),
      content: dto.content,
      parentId: dto.parent_id ?? undefined,
    }
  }

  // 登录用户(响应式): 登录时写入、退出时清空, 直接驱动 currentUser,
  // 避免直接读存储导致名字/身份登录后不刷新
  const authUser = ref<UserResponse | null>(getStoredUser<UserResponse>())
  const currentUser = computed(() => {
    if (authUser.value) {
      const r = roleMap[authUser.value.role] ?? 'student'
      return { name: authUser.value.nickname || authUser.value.username, id: String(authUser.value.id), label: roleLabelMap[r] }
    }
    return users[role.value] // 未登录兜底
  })
  // 侧边栏角标：我发布的、已被认领待我确认的数量（真实数据）
  const pendingCount = computed(() => myItems.value.filter((item) => item.status === '已认领').length)

  function setRole(nextRole: Role) {
    role.value = nextRole
    localStorage.setItem('role', nextRole)
  }
  function setActiveRoute(route: string) { activeRoute.value = route }
  async function login(account: string, password: string) {
    const { user, token } = await apiLogin({ username: account, password })  // 调真实接口
    setAuth(token, user)          // token + 真实 user 写进 localStorage(持久化)
    authUser.value = user         // 响应式写入当前用户 → 名字/身份立即刷新
    setRole(roleMap[user.role] ?? 'student')  // 用后端返回的 role 同步前端角色
    isAuthenticated.value = true  // 告诉全站"已登录"
  }

  function forceLogout() {
    clearAuth()                   // 清空 localStorage 登录态
    authUser.value = null         // 当前用户 → 回到未登录态
    isAuthenticated.value = false
    setRole('student')            // 重置角色, 避免残留管理员身份
  }

  async function logout() {
    try { await apiLogout() } catch { /* 后端失败也照退 */ }  // 通知后端失效 token
    forceLogout()
  }

  // 启动校验：若本地有 token，调 /user/me 拉取最新本人信息并校验会话是否仍有效
  // 失败(10005/10006/2)由 http.ts 清空登录态并派发 auth:expired，此处同步前端状态
  async function initSession() {
    if (!getToken()) return
    try {
      const res = await getMe()
      authUser.value = res.data                       // 刷新昵称/角色/积分/QQ 绑定等
      setRole(roleMap[res.data.role] ?? 'student')
      await fetchUnreadCount()                        // 拉取未读通知数
    } catch {
      forceLogout()                                   // 会话已失效，回退未登录
    }
  }

  function publish(item: Omit<Item, 'id' | 'author' | 'date' | 'status'> & { status?: ItemStatus }) {
    items.value.unshift({ id: Date.now(), ...item, status: role.value === 'student' ? '待审核' : item.status || '待审核', author: currentUser.value.name, date: '刚刚' })
  }

  // —— 真实后端数据（与本地 mock 并存，不替换）——
  const remoteItems = ref<Item[]>([])
  const remoteTotal = ref<number>(0)
  // 后端 ItemDTO -> 前端 Item 的统一映射（首页 / 我的发布 共用）
  function mapToFront(it: ItemDTO): Item {
    const meId = authUser.value?.id
    const meName = currentUser.value.name
    return {
      id: it.id,
      type: (it.type === 0 ? 'lost' : 'found') as ItemType,
      title: it.title,
      tags: (it.tags ?? []).map((t) => t.name),
      location: (it.locations && it.locations.length)
        ? it.locations.map((l) => l.name).join(' · ')
        : (it.location_detail || ''),
      // 编辑需要回传精确的叶子 location_id 与自由文本 location_detail
      locationId: (it.locations && it.locations.length) ? it.locations[it.locations.length - 1].id : undefined,
      locationDetail: it.location_detail || '',
      date: (it.created_at || '').slice(0, 10),
      status: it.status === 0 ? '招领中' : it.status === 1 ? '已认领' : '已关闭',
      author: meId != null && it.user_id === meId ? meName : `用户${it.user_id}`,
      color: 'blue',
      icon: it.type === 0 ? '◌' : '◉',
      desc: it.description,
      contact: it.contact,
      images: (it.images ?? []).map((img) => img.image_url),
      claimedBy: (it as any).claim_user_id ?? (it as any).claimed_by ?? undefined,
    }
  }

  async function fetchItems(params: ListItemsParams = {}) {
    try {
      const res = await listItems(params)
      remoteItems.value = (res.data?.items ?? []).map(mapToFront)
      remoteTotal.value = res.data?.total ?? 0
    } catch {
      // 拉取失败不影响本地 mock 展示
    }
  }

  // —— 我的发布（当前登录用户）：GET /item/mine ——
  const myItems = ref<Item[]>([])
  async function fetchMyItems() {
    try {
      const res = await listMyItems()
      myItems.value = (res.data?.items ?? []).map(mapToFront)
    } catch {
      // 未登录 / 接口异常：保持空，界面显示空态
    }
  }

  // —— 标签 / 地点（公开，用于筛选器与发布表单）——
  const tags = ref<TagDTO[]>([])
  const locations = ref<LocationDTO[]>([])
  async function fetchTags() {
    try { const res = await listTags(); tags.value = res.data ?? [] } catch { /* 拉取失败不影响 */ }
  }
  async function fetchLocations() {
    try { const res = await listLocations(); locations.value = res.data ?? [] } catch { /* 拉取失败不影响 */ }
  }
  // 标签名 -> id 映射（发布/编辑时把中文名转成后端 tag_ids）
  const tagIdByName = computed(() => {
    const m: Record<string, number> = {}
    tags.value.forEach((t) => { m[t.name] = t.id })
    return m
  })
  // 地点名 -> id 映射（首页筛选器把中文地点名转成后端 location_id）
  const locationIdByName = computed(() => {
    const m: Record<string, number> = {}
    locations.value.forEach((l) => { m[l.name] = l.id })
    return m
  })

  // —— 举报审核（审核员）：真接口 + mock 兜底 ——
  const reports = ref<ReportDTO[]>([
    { id: 101, reporter_id: 5, target_type: 0, target_id: 2, reason: 1, description: '该帖子含不当内容，请核实。', status: 0, created_at: '2026-06-16 10:12', item: { id: 2, title: '蓝色帆布包', type: 1, status: 0, description: '包内有一本《设计心理学》和校园卡。' } },
    { id: 102, reporter_id: 8, target_type: 0, target_id: 4, reason: 0, description: '疑似虚假招领信息。', status: 0, created_at: '2026-06-16 11:03', item: { id: 4, title: '银色保温杯', type: 1, status: 0, description: '杯身有一枚小树贴纸，落款为 W。' } },
    { id: 103, reporter_id: 3, target_type: 0, target_id: 1, reason: 2, description: '重复刷屏。', status: 1, created_at: '2026-06-15 09:40', item: { id: 1, title: '黑色 AirPods Pro 2', type: 1, status: 1, description: '在靠窗自习区拾到，已交至图书馆服务台。' } },
  ])
  async function fetchReports(params: ListReportsParams = { target_type: 0 }) {
    try {
      const res = await listReports(params)
      const list = (res.data?.items ?? []).map((r) => ({ ...r }))
      await Promise.all(list.map(async (r) => {
        if (r.target_type === 0 && !r.item) {
          try { const it = await getItem(r.target_id); r.item = it.data } catch { /* 忽略 */ }
        }
      }))
      reports.value = list
    } catch {
      // 后端 /admin/reports 未就绪：保留上面 mock，界面照常演示
    }
  }
  async function reviewReport(id: number, payload: { status: 1 | 2 | 3; audit_comment?: string }) {
    try {
      const res = await reviewReportApi(id, payload)
      const updated = res.data
      const idx = reports.value.findIndex((r) => r.id === id)
      if (idx >= 0 && updated) reports.value[idx] = updated
      return updated
    } catch {
      // 后端未就绪：本地直接改状态演示
      const r = reports.value.find((x) => x.id === id)
      if (r) {
        r.status = payload.status
        r.audit_comment = payload.audit_comment
        r.auditor_id = Number(authUser.value?.id ?? 0)
        r.audited_at = new Date().toISOString()
      }
    }
  }
  // —— 物品真实增删改（本人，调后端后刷新列表）——
  async function saveRemoteItem(id: number, payload: { title?: string; description?: string; location_detail?: string; tag_ids?: number[] }) {
    await updateItemApi({ id, ...payload })
    await fetchItems()
  }
  // —— 编辑我的发布：调 POST /item/update 改本人物品，成功刷新"我的发布"列表 ——
  async function updateMyItem(id: number, payload: { title?: string; description?: string; location_id?: number; location_detail?: string; tag_ids?: number[] }) {
    await updateItemApi({ id, ...payload })
    await fetchMyItems()
  }
  async function removeRemoteItem(id: number) {
    await deleteItemApi(id)
    await fetchItems()
  }
  async function closeRemoteItem(id: number) {
    await closeItemApi(id)
    await fetchItems()
  }
  async function submitClaim(id: number) {
    await claimItem(id)
    await fetchItems()   // 重新拉服务端数据，使认领状态以服务端返回的 claim_user_id 为准
  }
  // 撤销认领：/item/:id/claim/cancel（1->0）
  async function cancelMyClaim(id: number) {
    await cancelClaim(id)
    await fetchItems()   // 重新拉服务端数据，使认领状态以服务端返回的 claim_user_id 为准
  }
  // 发布者确认认领：/item/:id/confirm（1->2，发放积分）
  async function confirmMyItem(id: number) { await confirmItem(id) }
  // 我的认领页数据源：公开列表中我认领过的物品（进入 claims 页时拉全量）
  // “我是否认领”：完全以服务端返回的 claim_user_id 为准（item.claimedBy === 当前用户id）；
  //   不再使用浏览器 localStorage 缓存，杜绝跨账号误判（见 isClaimedByMe）
  function isClaimedByMe(item: Item): boolean {
    const meId = authUser.value?.id
    return meId != null && item.claimedBy != null && item.claimedBy === meId
  }
  const myClaims = computed(() => remoteItems.value.filter((i) => isClaimedByMe(i)))

  // —— 首页“件物品正在被认真寻找”计数（GET /item/count，L6）——
  const itemCount = ref<number>(0)
  async function fetchItemCount() {
    try { const res = await getItemCount(); itemCount.value = res.data ?? 0 } catch { /* 忽略 */ }
  }

  // —— 站内通知（Notification）: 真接口 ——
  const notifications = ref<NotificationItem[]>([])
  const unreadCount = ref<number>(0)
  async function fetchNotifications(params: { limit?: number; offset?: number } = {}) {
    try {
      const res = await getNotifications(params)
      notifications.value = res.data ?? []
    } catch { /* 拉取失败不影响 */ }
  }
  async function fetchUnreadCount() {
    try { const res = await getUnreadCount(); unreadCount.value = res.data ?? 0 } catch { /* 忽略 */ }
  }
  async function markNotificationsRead(ids: number[]) {
    if (!ids.length) return
    try { await markReadApi(ids); await fetchUnreadCount(); await fetchNotifications() } catch { /* 忽略 */ }
  }
  async function removeNotifications(ids: number[]) {
    if (!ids.length) return
    try { await deleteApi(ids); await fetchNotifications(); await fetchUnreadCount() } catch { /* 忽略 */ }
  }
  // 打开通知详情（GET /notifications/:id 自动已读）并返回完整内容
  async function openNotification(id: number): Promise<NotificationDetail | null> {
    try {
      const res = await getNotificationDetail(id)
      await fetchUnreadCount()
      await fetchNotifications()
      return res.data
    } catch { return null }
  }
  async function broadcastNotification(payload: { user_ids?: number[]; send_to_all?: boolean; type: number; title: string; content: string; related_id?: number | null }) {
    await adminBroadcast(payload)
  }

  // —— 注册（L3，后端 /user/create 现成）——
  async function register(account: string, password: string, nickname: string) {
    await createUser({ username: account, password, nickname })
  }

  // —— 用户设置（L5）：改资料 / 换头像 ——
  async function updateMyProfile(payload: { nickname?: string; realname?: string; gender?: number; avatar?: string }) {
    await updateUser(payload)
    await initSession()   // 刷新本地用户信息（昵称/头像/QQ 等）
  }
  async function bindQQ(qq: number, code: number) {
    await bindQQApi({ qq, code })   // POST /user/qq/bind
    await initSession()             // 刷新本地用户（qq 字段）
  }
  async function sendQQCode(qq: number) {
    await getQQCode({ qq })         // POST /user/qq/get-code
  }
  function approve(id: number) { const item = items.value.find((entry) => entry.id === id); if (item) item.status = '招领中' }
  function reject(id: number, reason: string) { const item = items.value.find((entry) => entry.id === id); if (item) item.status = '已驳回' }
  function updateItem(id: number, patch: Partial<Item>) {
    const item = items.value.find((entry) => entry.id === id)
    if (item) Object.assign(item, patch)
  }
  function toggleItemPublished(id: number) {
    const item = items.value.find((entry) => entry.id === id)
    if (!item) return
    item.status = item.status === '已关闭' ? '招领中' : '已关闭'
  }
  function removeItem(id: number) { items.value = items.value.filter((entry) => entry.id !== id) }
  function toggleFavorite(id: number) {
    favoriteItemIds.value = favoriteItemIds.value.includes(id)
      ? favoriteItemIds.value.filter((itemId) => itemId !== id)
      : [...favoriteItemIds.value, id]
  }
  function toggleItemLike(id: number) {
    likedItemIds.value = likedItemIds.value.includes(id)
      ? likedItemIds.value.filter((itemId) => itemId !== id)
      : [...likedItemIds.value, id]
  }
  async function fetchComments(itemId: number) {
    try {
      const res = await listComments({ item_id: itemId, started_id: 0, limit: 100 })
      if (res && Array.isArray(res.comment_dtos)) {
        const fromServer = res.comment_dtos.map(mapToComment)
        comments.value = comments.value.filter((c) => c.itemId !== itemId).concat(fromServer)
      }
    } catch (e) {
      // 后端 comment 接口未就绪（404/未实现）时，保留本地 mock，保证评论区不崩
      console.warn('[comment] 拉取评论失败，保留本地 mock：', (e as Error).message)
    }
  }
  async function addComment(comment: Omit<Comment, 'id' | 'date'>) {
    await createComment({
      item_id: comment.itemId,
      parent_id: comment.parentId ?? null,
      content: comment.content,
      user_id: authUser.value?.id ?? 0,
    })
    await fetchComments(comment.itemId)
  }
  return { role, activeRoute, isAuthenticated, notices, items, remoteItems, remoteTotal, myItems, fetchMyItems, tags, locations, fetchTags, fetchLocations, tagIdByName, locationIdByName, reports, fetchReports, reviewReport, myClaims, favoriteItemIds, likedItemIds, comments, currentUser, pendingCount, setRole, setActiveRoute, login, logout, publish, fetchItems, submitClaim, approve, reject, cancelMyClaim, confirmMyItem, toggleFavorite, toggleItemLike, addComment, fetchComments, updateItem, toggleItemPublished, removeItem, saveRemoteItem, removeRemoteItem, closeRemoteItem, updateMyItem, forceLogout, initSession, isClaimedByMe, itemCount, fetchItemCount, register, updateMyProfile, bindQQ, sendQQCode, authUser, fetchNotices, latestNotice, dismissedNoticeIds, dismissNotice, homeNotice, readNoticeIds, unreadNoticeCount, markNoticeRead, markAllNoticesRead, notifications, unreadCount, fetchNotifications, fetchUnreadCount, markNotificationsRead, removeNotifications, openNotification, broadcastNotification, mapToFront }
})
