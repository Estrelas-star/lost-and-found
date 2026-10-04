import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'

export type Role = 'student' | 'itemAdmin' | 'systemAdmin'
export type ItemType = 'lost' | 'found'
export type ItemStatus = '待审核' | '招领中' | '待认领' | '已认领' | '已找回' | '已驳回' | '已关闭' | '已撤回'
export type ClaimStatus = '待审核' | '已通过' | '已驳回'

export const ROLE_LABELS: Record<Role, string> = {
  student: '普通学生',
  itemAdmin: '失物招领管理员',
  systemAdmin: '系统管理员'
}

export interface User {
  /** 登录账号 */
  account: string
  /** 登录密码 */
  password: string
  /** 昵称 / 姓名 */
  name: string
  /** 显示标签（沿用既有 UI 的 label 字段） */
  label: string
  /** 角色 */
  role: Role
  /** 是否被禁用（模拟封禁） */
  disabled: boolean
  /** 联系方式（注册时填写） */
  contact?: string
}

export interface Item {
  id: number
  ownerId: string
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
  reviewReason?: string
}

export interface Claim {
  id: number
  itemId: number
  ownerId: string
  item: string
  applicantId: string
  applicant: string
  description: string
  contact: string
  publisherContact?: string
  rejectionReason?: string
  appliedAt: string
  date: string
  status: ClaimStatus
}

export interface Clue {
  id: number
  itemId: number
  ownerId: string
  item: string
  reporterId: string
  reporter: string
  description: string
  contact: string
  images: string[]
  appliedAt: string
  date: string
  /** 发布者是否已查看该线索（未读角标数据源） */
  isRead: boolean
}

export interface SystemNotification {
  id: number
  recipientId: string
  recipientName: string
  message: string
  createdAt: string
  read: boolean
  kind?: 'clue' | 'claim'
  itemId?: number
  clueId?: number
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

const SYS_ADMIN_ACCOUNT = 'sysadmin'

function seedUsers(): User[] {
  const stored = localStorage.getItem('registered_users')
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as User[]
      if (Array.isArray(parsed) && parsed.length) {
        // 确保内置系统管理员始终存在，且不可被注册/篡改
        const hasSysAdmin = parsed.some((u) => u.account === SYS_ADMIN_ACCOUNT)
        if (hasSysAdmin) return parsed
        return [sysAdminUser(), ...parsed]
      }
    } catch {
      // ignore corrupted storage
    }
  }
  return [
    sysAdminUser(),
    { account: '2023010218', password: '123456', name: '林知夏', label: '普通学生', role: 'student', disabled: false, contact: '13800000001' },
    { account: 'teacher01', password: '123456', name: '赵老师', label: '失物招领管理员', role: 'itemAdmin', disabled: false, contact: '13800000002' }
  ]
}

function sysAdminUser(): User {
  return { account: SYS_ADMIN_ACCOUNT, password: '123456', name: '系统管理员', label: '系统管理员', role: 'systemAdmin', disabled: false }
}

function loadNotifications(): SystemNotification[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem('notifications') || '[]')
    return Array.isArray(parsed) ? parsed as SystemNotification[] : []
  } catch {
    return []
  }
}

function loadClaims(): Claim[] {
  const stored = localStorage.getItem('claims')
  if (!stored) {
    return [{ id: 1, itemId: 1, ownerId: '李同学', item: '黑色 AirPods Pro 2', applicantId: '2023010218', applicant: '林同学', description: '描述物品特征以供核验', contact: '13800000001', appliedAt: '2026-06-15T14:20:00.000Z', date: '06-15 14:20', status: '待审核' }]
  }
  try {
    const parsed: unknown = JSON.parse(stored)
    if (!Array.isArray(parsed)) return []
    return parsed.map((entry, index) => {
      const record = typeof entry === 'object' && entry !== null ? entry as Record<string, unknown> : {}
      const appliedAt = typeof record.appliedAt === 'string' ? record.appliedAt : typeof record.date === 'string' ? record.date : ''
      const status: ClaimStatus = record.status === '已通过' || record.status === '已驳回' ? record.status : '待审核'
      return {
        id: typeof record.id === 'number' ? record.id : Date.now() + index,
        itemId: typeof record.itemId === 'number' ? record.itemId : 0,
        ownerId: typeof record.ownerId === 'string' ? record.ownerId : '',
        item: typeof record.item === 'string' ? record.item : '',
        applicantId: typeof record.applicantId === 'string' ? record.applicantId : '',
        applicant: typeof record.applicant === 'string' ? record.applicant : '',
        description: typeof record.description === 'string' ? record.description : '',
        contact: typeof record.contact === 'string' ? record.contact : '',
        publisherContact: typeof record.publisherContact === 'string' ? record.publisherContact : undefined,
        rejectionReason: typeof record.rejectionReason === 'string' ? record.rejectionReason : undefined,
        appliedAt,
        date: typeof record.date === 'string' ? record.date : appliedAt,
        status
      }
    })
  } catch {
    return []
  }
}

function loadClues(): Clue[] {
  const stored = localStorage.getItem('clues')
  if (!stored) return []
  try {
    const parsed: unknown = JSON.parse(stored)
    if (!Array.isArray(parsed)) return []
    return parsed.map((entry) => {
      const record = typeof entry === 'object' && entry !== null ? entry as Record<string, unknown> : {}
      const appliedAt = typeof record.appliedAt === 'string' ? record.appliedAt : typeof record.date === 'string' ? record.date : ''
      return {
        id: typeof record.id === 'number' ? record.id : Date.now(),
        itemId: typeof record.itemId === 'number' ? record.itemId : 0,
        ownerId: typeof record.ownerId === 'string' ? record.ownerId : '',
        item: typeof record.item === 'string' ? record.item : '',
        reporterId: typeof record.reporterId === 'string' ? record.reporterId : '',
        reporter: typeof record.reporter === 'string' ? record.reporter : '',
        description: typeof record.description === 'string' ? record.description : '',
        contact: typeof record.contact === 'string' ? record.contact : '',
        images: Array.isArray(record.images) ? record.images as string[] : [],
        appliedAt,
        date: typeof record.date === 'string' ? record.date : appliedAt,
        /** 旧数据没有 isRead 字段时默认视为未读，避免角标数据丢失 */
        isRead: record.isRead === true
      }
    })
  } catch {
    return []
  }
}

function seedItems(): Item[] {
  return [
    { id: 1, ownerId: '李同学', type: 'found', title: '黑色 AirPods Pro 2', tags: ['数码'], location: '图书馆三楼', date: '06-15', status: '待认领', author: '李同学', contact: '13800001234', color: 'ink', icon: '◉', desc: '在靠窗自习区拾到，已交至图书馆服务台。' },
    { id: 2, ownerId: '周同学', type: 'lost', title: '蓝色帆布包', tags: ['日用', '书籍'], location: '南区食堂', date: '06-14', status: '招领中', author: '周同学', color: 'blue', icon: '▰', desc: '包内有一本《设计心理学》和校园卡。' },
    { id: 3, ownerId: '拾光志愿者', type: 'found', title: '校园卡 · 陈知行', tags: ['证件'], location: '操场看台', date: '06-14', status: '待认领', author: '拾光志愿者', color: 'mint', icon: '▣', desc: '已核验姓名，等待失主联系。' },
    { id: 4, ownerId: '王同学', type: 'lost', title: '银色保温杯', tags: ['日用'], location: '文科楼 204', date: '06-13', status: '招领中', author: '王同学', color: 'coral', icon: '◒', desc: '杯身有一枚小树贴纸，落款为 W。' },
    { id: 5, ownerId: '拾光志愿者', type: 'found', title: '一串钥匙', tags: ['其他'], location: '西门快递站', date: '06-12', status: '已认领', author: '拾光志愿者', color: 'yellow', icon: '⌘', desc: '三把钥匙，附有蓝色小挂件。' }
  ]
}

function loadItems(): Item[] {
  const stored = localStorage.getItem('items')
  if (!stored) return seedItems()
  try {
    const parsed: unknown = JSON.parse(stored)
    if (!Array.isArray(parsed) || !parsed.length) return seedItems()
    return parsed.map((entry) => {
      const record = typeof entry === 'object' && entry !== null ? entry as Record<string, unknown> : {}
      const status = typeof record.status === 'string' ? record.status as ItemStatus : '待审核'
      return {
        id: typeof record.id === 'number' ? record.id : Date.now(),
        ownerId: typeof record.ownerId === 'string' ? record.ownerId : '',
        type: record.type === 'found' ? 'found' : 'lost',
        title: typeof record.title === 'string' ? record.title : '',
        tags: Array.isArray(record.tags) ? record.tags as string[] : [],
        location: typeof record.location === 'string' ? record.location : '',
        date: typeof record.date === 'string' ? record.date : '',
        status,
        author: typeof record.author === 'string' ? record.author : '',
        color: typeof record.color === 'string' ? record.color : 'ink',
        icon: typeof record.icon === 'string' ? record.icon : '◉',
        desc: typeof record.desc === 'string' ? record.desc : '',
        contact: typeof record.contact === 'string' ? record.contact : undefined,
        images: Array.isArray(record.images) ? record.images as string[] : undefined,
        reviewReason: typeof record.reviewReason === 'string' ? record.reviewReason : undefined
      }
    })
  } catch {
    return seedItems()
  }
}

export const useAppStore = defineStore('app', () => {
  const role = ref<Role>((localStorage.getItem('role') as Role) || 'student')
  const editingItemId = ref<number | null>(null)
  const registeredUsers = ref<User[]>(seedUsers())
  const activeRoute = ref('home')
  const isAuthenticated = ref(localStorage.getItem('auth_token') === 'mock-token')
  const notices = ref<any[]>([
    { id: 1, title: '期末周拾光服务时间调整通知', date: '2026-06-12', tag: '重要' },
    { id: 2, title: '毕业季物品集中认领活动开始啦', date: '2026-06-08', tag: '活动' }
  ])
  const items = ref<Item[]>(loadItems())
  const claims = ref<Claim[]>(loadClaims())
  const clues = ref<Clue[]>(loadClues())
  for (const claim of claims.value) {
    if (!claim.ownerId) claim.ownerId = items.value.find((item) => item.id === claim.itemId)?.ownerId ?? ''
  }
  const notifications = ref<SystemNotification[]>(loadNotifications())
  for (const item of items.value) {
    const itemClaims = claims.value.filter((claim) => claim.itemId === item.id)
    if (itemClaims.some((claim) => claim.status === '已通过')) item.status = '已认领'
    else if (itemClaims.some((claim) => claim.status === '待审核')) item.status = '待认领'
    else if (item.status === '待认领' && itemClaims.some((claim) => claim.status === '已驳回')) item.status = '招领中'
  }
  const favoriteItemIds = ref<number[]>([])
  const likedItemIds = ref<number[]>([])
  const comments = ref<Comment[]>([
    { id: 1, itemId: 1, author: '林知夏', avatar: '林', date: '今天 09:24', content: '请问是在图书馆哪一侧的自习区找到的呢？', likes: 3, liked: false },
    { id: 2, itemId: 1, author: '李同学', avatar: '李', date: '今天 09:31', content: '是在三楼靠窗的位置，已经交给服务台了。', likes: 5, liked: false, parentId: 1, replyTo: '林知夏' },
    { id: 3, itemId: 2, author: '周同学', avatar: '周', date: '昨天 18:42', content: '如果有看到蓝色帆布包，麻烦帮忙留意一下，谢谢！', likes: 2, liked: false }
  ])

  const currentUser = computed(() => registeredUsers.value.find((u) => u.account === account.value) ?? seedUsers()[0])
  const pendingCount = computed(() => items.value.filter((item) => item.status === '待审核').length + claims.value.filter((claim) => claim.status === '待审核').length)

  function persistUsers() {
    localStorage.setItem('registered_users', JSON.stringify(registeredUsers.value))
  }

  watch(claims, (value) => localStorage.setItem('claims', JSON.stringify(value)), { deep: true, immediate: true })
  watch(notifications, (value) => localStorage.setItem('notifications', JSON.stringify(value)), { deep: true, immediate: true })
  watch(clues, (value) => localStorage.setItem('clues', JSON.stringify(value)), { deep: true, immediate: true })
  watch(items, (value) => localStorage.setItem('items', JSON.stringify(value)), { deep: true, immediate: true })

  /** 当前登录的账号 */
  const account = ref<string>((localStorage.getItem('account') as string) || '')

  /** 校验账号密码，返回匹配用户；不匹配返回 null */
  function authenticate(inputAccount: string, inputPassword: string): User | null {
    const user = registeredUsers.value.find((u) => u.account === inputAccount && u.password === inputPassword)
    return user || null
  }

  function registerUser(data: { account: string; password: string; name: string; contact: string }): { ok: boolean; message: string } {
    const exists = registeredUsers.value.some((u) => u.account === data.account)
    if (exists) return { ok: false, message: '该账号已被注册' }
    if (data.account === SYS_ADMIN_ACCOUNT) return { ok: false, message: '该账号已被占用' }
    registeredUsers.value.push({
      account: data.account,
      password: data.password,
      name: data.name,
      label: '普通学生',
      role: 'student',
      disabled: false,
      contact: data.contact
    })
    persistUsers()
    return { ok: true, message: '注册成功' }
  }

  /** 修改某用户角色；系统管理员不可被修改 */
  function changeUserRole(inputAccount: string, nextRole: Role): { ok: boolean; message: string } {
    if (inputAccount === SYS_ADMIN_ACCOUNT) return { ok: false, message: '系统管理员角色不可修改' }
    const user = registeredUsers.value.find((u) => u.account === inputAccount)
    if (!user) return { ok: false, message: '用户不存在' }
    user.role = nextRole
    user.label = ROLE_LABELS[nextRole]
    persistUsers()
    return { ok: true, message: '角色修改成功' }
  }

  /** 禁用 / 启用某用户；系统管理员不可被禁用 */
  function toggleUserDisabled(inputAccount: string): { ok: boolean; message: string } {
    if (inputAccount === SYS_ADMIN_ACCOUNT) return { ok: false, message: '系统管理员不可被禁用' }
    const user = registeredUsers.value.find((u) => u.account === inputAccount)
    if (!user) return { ok: false, message: '用户不存在' }
    user.disabled = !user.disabled
    persistUsers()
    return { ok: true, message: user.disabled ? '账号已禁用' : '账号已启用' }
  }

  function setRole(nextRole: Role) {
    role.value = nextRole
    localStorage.setItem('role', nextRole)
  }
  function setActiveRoute(route: string) { activeRoute.value = route }
  function login(inputAccount: string, inputPassword: string): { ok: boolean; message: string } {
    const user = authenticate(inputAccount, inputPassword)
    if (!user) return { ok: false, message: '账号或密码错误' }
    if (user.disabled) return { ok: false, message: '该账号已被禁用' }
    role.value = user.role
    account.value = user.account
    localStorage.setItem('role', user.role)
    localStorage.setItem('account', user.account)
    isAuthenticated.value = true
    localStorage.setItem('auth_token', 'mock-token')
    return { ok: true, message: '登录成功' }
  }
  function logout() {
    isAuthenticated.value = false
    localStorage.removeItem('auth_token')
    localStorage.removeItem('role')
    localStorage.removeItem('account')
  }
  function publish(item: Omit<Item, 'id' | 'ownerId' | 'author' | 'date' | 'status'> & { status?: ItemStatus }) {
    items.value.unshift({ id: Date.now(), ...item, ownerId: currentUser.value.account, status: role.value === 'student' ? '待审核' : item.status || '待审核', author: currentUser.value.name, date: '刚刚' })
  }
  function beginEditItem(id: number) { editingItemId.value = id }
  function clearEditingItem() { editingItemId.value = null }
  function withdrawItem(id: number) {
    const item = items.value.find((entry) => entry.id === id)
    if (item && (item.status === '招领中' || item.status === '待认领')) item.status = '已撤回'
  }
  /** 确认找回：将该物品状态改为已找回，停止展示并持久化到 localStorage */
  function confirmRecovered(id: number) {
    const item = items.value.find((entry) => entry.id === id)
    if (!item || (item.status !== '招领中' && item.status !== '待认领')) return false
    item.status = '已找回'
    localStorage.setItem('items', JSON.stringify(items.value))
    return true
  }
  function submitClaim(item: Item, application: { description?: string; contact?: string } = {}) {
    if (item.ownerId === currentUser.value.account) return
    const appliedAt = new Date().toISOString()
    claims.value.unshift({
      id: Date.now(),
      itemId: item.id,
      ownerId: item.ownerId,
      item: item.title,
      applicantId: currentUser.value.account,
      applicant: currentUser.value.name,
      description: application.description?.trim() ?? '',
      contact: application.contact?.trim() || currentUser.value.contact || '',
      appliedAt,
      date: new Date(appliedAt).toLocaleString('zh-CN'),
      status: '待审核'
    })
    item.status = '待认领'
  }
  function submitClue(item: Item, clue: { description: string; contact: string; images: string[] }) {
    if (item.type !== 'lost' || item.ownerId === currentUser.value.account) return
    const appliedAt = new Date().toISOString()
    const clueId = Date.now()
    clues.value.unshift({
      id: clueId,
      itemId: item.id,
      ownerId: item.ownerId,
      item: item.title,
      reporterId: currentUser.value.account,
      reporter: currentUser.value.name,
      description: clue.description.trim(),
      contact: clue.contact.trim(),
      images: [...clue.images],
      appliedAt,
      date: new Date(appliedAt).toLocaleString('zh-CN'),
      isRead: false
    })
    notifications.value.unshift({
      id: clueId + 1,
      recipientId: item.ownerId,
      recipientName: item.author,
      message: `您发布的【${item.title}】收到新线索`,
      createdAt: new Date(appliedAt).toLocaleString('zh-CN'),
      read: false,
      kind: 'clue',
      itemId: item.id,
      clueId
    })
  }
  function approve(id: number) { const item = items.value.find((entry) => entry.id === id); if (item) item.status = '招领中' }
  function reject(id: number, reason: string) {
    const item = items.value.find((entry) => entry.id === id)
    if (!item) return
    item.status = '已驳回'
    item.reviewReason = reason
  }
  function updateClaim(id: number, status: ClaimStatus, rejectionReason = '') {
    const claim = claims.value.find((entry) => entry.id === id)
    if (!claim || claim.status !== '待审核') return
    claim.status = status
    claim.rejectionReason = status === '已驳回' ? rejectionReason.trim() : undefined
    const item = items.value.find((entry) => entry.id === claim.itemId)
    if (!item) return
    if (status === '已通过') {
      item.status = '已认领'
      claim.publisherContact = item.contact?.trim() ?? ''
      const approvedAt = new Date().toLocaleString('zh-CN')
      const publisher = registeredUsers.value.find((user) => user.name === item.author)
      notifications.value.unshift({
        id: Date.now(),
        recipientId: publisher?.account ?? item.author,
        recipientName: item.author,
        message: `您发布的【${item.title}】认领申请已通过，认领人联系方式已发送给您`,
        createdAt: approvedAt,
        read: false
      })
      notifications.value.unshift({
        id: Date.now() + 1,
        recipientId: claim.applicantId,
        recipientName: claim.applicant,
        message: `您对【${item.title}】的认领申请已通过，发布者联系方式为：手机号 ${claim.publisherContact || '暂未提供'}`,
        createdAt: approvedAt,
        read: false
      })
    }
    if (status === '已驳回') {
      item.status = claims.value.some((entry) => entry.itemId === item.id && entry.status === '待审核') ? '待认领' : '招领中'
    }
  }
  function markNotificationsRead(ids: number[]) {
    for (const notification of notifications.value) {
      if (ids.includes(notification.id)) notification.read = true
    }
  }
  function markClueNotificationsRead(itemId: number) {
    const clueNotificationIds = notifications.value
      .filter((notification) => notification.kind === 'clue' && notification.itemId === itemId && notification.recipientId === account.value)
      .map((notification) => notification.id)
    markNotificationsRead(clueNotificationIds)
  }
  /** 打开/关闭某物品线索列表时统一调用：将线索 isRead 置为 true，并把对应未读线索通知标为已读（兼容 recipientId 为账号或姓名的旧数据） */
  function markItemCluesRead(itemId: number) {
    let changed = false
    for (const clue of clues.value) {
      if (clue.itemId === itemId && !clue.isRead) {
        clue.isRead = true
        changed = true
      }
    }
    const item = items.value.find((entry) => entry.id === itemId)
    const clueNotificationIds = notifications.value
      .filter((notification) => notification.kind === 'clue' && notification.itemId === itemId && !notification.read
        && (notification.recipientId === account.value || (item && notification.recipientName === item.author) || notification.recipientName === currentUser.value.name))
      .map((notification) => notification.id)
    if (clueNotificationIds.length) markNotificationsRead(clueNotificationIds)
    if (changed || clueNotificationIds.length) {
      // 触发 deep watcher 将更新同步到 localStorage
      notifications.value = [...notifications.value]
      clues.value = [...clues.value]
    }
  }
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

  return { role, account, registeredUsers, activeRoute, isAuthenticated, notices, items, claims, clues, notifications, favoriteItemIds, likedItemIds, comments, currentUser, pendingCount, editingItemId, setRole, setActiveRoute, login, logout, authenticate, registerUser, changeUserRole, toggleUserDisabled, publish, beginEditItem, clearEditingItem, withdrawItem, confirmRecovered, submitClaim, submitClue, approve, reject, updateClaim, markNotificationsRead, markClueNotificationsRead, markItemCluesRead, toggleFavorite, toggleItemLike, addComment, toggleCommentLike, updateItem, toggleItemPublished, removeItem }
})
