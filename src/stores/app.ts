import { computed, ref } from 'vue'
import { login as apiLogin, logout as apiLogout } from '../api/user'
import {
  listItems, getItem, listTags, listLocations,
  updateItem as updateItemApi, deleteItem as deleteItemApi, closeItem as closeItemApi,
  listReports, reviewReport as reviewReportApi,
  type ReportDTO, type ListReportsParams, type TagDTO, type LocationDTO, type ListItemsParams,
} from '../api/item'
import { setAuth, clearAuth, getToken, getStoredUser } from '../utils/auth'
import type { UserResponse } from '../api/types'

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
  date: string
  status: ItemStatus
  author: string
  color: string
  icon: string
  desc: string
  contact?: string
  images?: string[]
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
  likes: number
  liked: boolean
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
  const notices = ref<any[]>([
    { id: 1, title: '期末周拾光服务时间调整通知', date: '2026-06-12', tag: '重要' },
    { id: 2, title: '毕业季物品集中认领活动开始啦', date: '2026-06-08', tag: '活动' }
  ])
  const items = ref<Item[]>([
    { id: 1, type: 'found', title: '黑色 AirPods Pro 2', tags: ['数码'], location: '图书馆三楼', date: '06-15', status: '待认领', author: '李同学', color: 'ink', icon: '◉', desc: '在靠窗自习区拾到，已交至图书馆服务台。' },
    { id: 2, type: 'lost', title: '蓝色帆布包', tags: ['日用', '书籍'], location: '南区食堂', date: '06-14', status: '招领中', author: '周同学', color: 'blue', icon: '▰', desc: '包内有一本《设计心理学》和校园卡。' },
    { id: 3, type: 'found', title: '校园卡 · 陈知行', tags: ['证件'], location: '操场看台', date: '06-14', status: '待认领', author: '拾光志愿者', color: 'mint', icon: '▣', desc: '已核验姓名，等待失主联系。' },
    { id: 4, type: 'lost', title: '银色保温杯', tags: ['日用'], location: '文科楼 204', date: '06-13', status: '招领中', author: '王同学', color: 'coral', icon: '◒', desc: '杯身有一枚小树贴纸，落款为 W。' },
    { id: 5, type: 'found', title: '一串钥匙', tags: ['其他'], location: '西门快递站', date: '06-12', status: '已认领', author: '拾光志愿者', color: 'yellow', icon: '⌘', desc: '三把钥匙，附有蓝色小挂件。' }
  ])
  const claims = ref<Claim[]>([{ id: 1, item: '黑色 AirPods Pro 2', applicant: '林同学', date: '06-15 14:20', status: '审核中' }])
  const favoriteItemIds = ref<number[]>([])
  const likedItemIds = ref<number[]>([])
  const comments = ref<Comment[]>([
    { id: 1, itemId: 1, author: '林知夏', avatar: '林', date: '今天 09:24', content: '请问是在图书馆哪一侧的自习区找到的呢？', likes: 3, liked: false },
    { id: 2, itemId: 1, author: '李同学', avatar: '李', date: '今天 09:31', content: '是在三楼靠窗的位置，已经交给服务台了。', likes: 5, liked: false, parentId: 1, replyTo: '林知夏' },
    { id: 3, itemId: 2, author: '周同学', avatar: '周', date: '昨天 18:42', content: '如果有看到蓝色帆布包，麻烦帮忙留意一下，谢谢！', likes: 2, liked: false }
  ])

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
  const pendingCount = computed(() => items.value.filter((item) => item.status === '待审核').length + claims.value.filter((claim) => claim.status === '审核中').length)

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

  async function logout() {
    try { await apiLogout() } catch { /* 后端失败也照退 */ }  // 通知后端失效 token
    clearAuth()                   // 清空 localStorage 登录态（退出清空）
    authUser.value = null         // 清空当前用户 → 名字/身份立即回到未登录态
    isAuthenticated.value = false
    setRole('student')            // 重置角色, 避免残留管理员身份
  }

  function publish(item: Omit<Item, 'id' | 'author' | 'date' | 'status'> & { status?: ItemStatus }) {
    items.value.unshift({ id: Date.now(), ...item, status: role.value === 'student' ? '待审核' : item.status || '待审核', author: currentUser.value.name, date: '刚刚' })
  }

  // —— 真实后端数据（与本地 mock 并存，不替换）——
  const remoteItems = ref<Item[]>([])
  async function fetchItems(params: ListItemsParams = {}) {
    try {
      const res = await listItems(params)
      const meId = authUser.value?.id
      const meName = currentUser.value.name
      remoteItems.value = (res.data?.items ?? []).map((it) => ({
        id: it.id,
        type: (it.type === 0 ? 'lost' : 'found') as ItemType,
        title: it.title,
        tags: (it.tags ?? []).map((t) => t.name),
        location: (it.locations && it.locations.length)
          ? it.locations.map((l) => l.name).join(' · ')
          : (it.location_detail || ''),
        date: (it.created_at || '').slice(0, 10),
        status: it.status === 0 ? '招领中' : it.status === 1 ? '已认领' : '已关闭',
        author: meId != null && it.user_id === meId ? meName : `用户${it.user_id}`,
        color: 'blue',
        icon: it.type === 0 ? '◌' : '◉',
        desc: it.description,
        contact: it.contact,
        images: (it.images ?? []).map((img) => img.image_url),
      }))
    } catch {
      // 拉取失败不影响本地 mock 展示
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
  async function removeRemoteItem(id: number) {
    await deleteItemApi(id)
    await fetchItems()
  }
  async function closeRemoteItem(id: number) {
    await closeItemApi(id)
    await fetchItems()
  }
  function submitClaim(item: Item) { claims.value.unshift({ id: Date.now(), item: item.title, applicant: currentUser.value.name, date: '刚刚', status: '审核中' }) }
  function approve(id: number) { const item = items.value.find((entry) => entry.id === id); if (item) item.status = '招领中' }
  function reject(id: number, reason: string) { const item = items.value.find((entry) => entry.id === id); if (item) item.status = '已驳回' }
  function updateClaim(id: number, status: string) { const claim = claims.value.find((entry) => entry.id === id); if (claim) claim.status = status }
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
  function addComment(comment: Omit<Comment, 'id' | 'date' | 'likes' | 'liked'>) {
    comments.value.push({ ...comment, id: Date.now(), date: '刚刚', likes: 0, liked: false })
  }
  function toggleCommentLike(id: number) {
    const comment = comments.value.find((entry) => entry.id === id)
    if (!comment) return
    comment.liked = !comment.liked
    comment.likes += comment.liked ? 1 : -1
  }

  return { role, activeRoute, isAuthenticated, notices, items, remoteItems, tags, locations, fetchTags, fetchLocations, tagIdByName, reports, fetchReports, reviewReport, claims, favoriteItemIds, likedItemIds, comments, currentUser, pendingCount, setRole, setActiveRoute, login, logout, publish, fetchItems, submitClaim, approve, reject, updateClaim, toggleFavorite, toggleItemLike, addComment, toggleCommentLike, updateItem, toggleItemPublished, removeItem, saveRemoteItem, removeRemoteItem, closeRemoteItem }
})
