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

/** 早期内置的演示账号（现已被移除，若存在于旧 localStorage 缓存中则过滤掉，避免"复活"） */
const DEMO_ACCOUNTS = new Set(['2023010218', 'teacher01'])

function seedUsers(): User[] {
  const stored = localStorage.getItem('registered_users')
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as User[]
      if (Array.isArray(parsed) && parsed.length) {
        // 过滤旧缓存中的演示账号（林知夏 / 赵老师），仅保留 sysadmin 与用户自行注册的账号
        const cleaned = parsed.filter((u) => !DEMO_ACCOUNTS.has(u.account))
        // 确保内置系统管理员始终存在，且不可被注册/篡改
        const hasSysAdmin = cleaned.some((u) => u.account === SYS_ADMIN_ACCOUNT)
        if (hasSysAdmin) return cleaned
        return [sysAdminUser(), ...cleaned]
      }
    } catch {
      // ignore corrupted storage
    }
  }
  return [sysAdminUser()]
}

function sysAdminUser(): User {
  return { account: SYS_ADMIN_ACCOUNT, password: '123456', name: '系统管理员', label: '系统管理员', role: 'systemAdmin', disabled: false }
}

function loadNotifications(): SystemNotification[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem('notifications') || '[]')
    if (!Array.isArray(parsed)) return []
    const list = parsed as SystemNotification[]
    // 清洗历史重复通知：同一收件人+同一内容只保留最新一条
    const seen = new Set<string>()
    const deduped: SystemNotification[] = []
    for (const item of list) {
      const recipient = typeof item.recipientId === 'string' ? item.recipientId : ''
      const message = typeof item.message === 'string' ? item.message : ''
      const key = `${recipient}-${message}`
      if (seen.has(key)) continue
      seen.add(key)
      deduped.push(item)
    }
    return deduped
  } catch {
    return []
  }
}

function loadClaims(): Claim[] {
  const stored = localStorage.getItem('claims')
  if (!stored) return []
  try {
    const parsed: unknown = JSON.parse(stored)
    if (!Array.isArray(parsed)) return []
    const claims = parsed.map((entry, index) => {
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
    // 清洗历史脏数据：同一申请人(itemId+applicantId)只保留最新一条申请
    const seen = new Set<string>()
    const deduped: Claim[] = []
    for (const claim of claims) {
      const key = `${claim.itemId}-${claim.applicantId}`
      if (seen.has(key)) continue
      seen.add(key)
      deduped.push(claim)
    }
    return deduped
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
  // 初始不再内置写死的假数据，物品完全由用户自行发布
  return []
}

function loadItems(): Item[] {
  const stored = localStorage.getItem('items')
  if (!stored) return []
  try {
    const parsed: unknown = JSON.parse(stored)
    if (!Array.isArray(parsed)) return []
    const mapped: Item[] = parsed.map((entry) => {
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
    // 迁移清理：移除早期内置的写死种子数据（按 id + 标题特征识别，保留用户自行发布的数据）
    const seedTitles = new Set(['黑色 AirPods Pro 2', '蓝色帆布包', '校园卡 · 陈知行', '银色保温杯', '一串钥匙'])
    return mapped.filter((item) => !(item.id <= 5 && seedTitles.has(item.title)))
  } catch {
    return []
  }
}

export const useAppStore = defineStore('app', () => {
  const role = ref<Role>((localStorage.getItem('role') as Role) || 'student')
  const editingItemId = ref<number | null>(null)
  const registeredUsers = ref<User[]>(seedUsers())
  // 初始化后立即持久化：把过滤掉旧演示账号的用户列表写回 localStorage，避免刷新后"复活"
  localStorage.setItem('registered_users', JSON.stringify(registeredUsers.value))
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
  const comments = ref<Comment[]>([])

  const currentUser = computed(() => registeredUsers.value.find((u) => u.account === account.value)
    ?? { account: '', password: '', name: '游客', label: '普通学生', role: 'student' as Role, disabled: false })

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
    if (item.ownerId === currentUser.value.account) return false
    // 去重：同一用户对同一物品只能提交一次认领申请
    const alreadyClaimed = claims.value.some((claim) => claim.itemId === item.id && claim.applicantId === currentUser.value.account && claim.status !== '已驳回')
    if (alreadyClaimed) return false
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
    notifications.value.unshift({
      id: Date.now(),
      recipientId: item.ownerId,
      recipientName: item.author,
      message: `您发布的【${item.title}】收到了新的认领申请，请及时处理`,
      createdAt: new Date(appliedAt).toLocaleString('zh-CN'),
      read: false,
      kind: 'claim',
      itemId: item.id
    })
    return true
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
  /** 发布者同意某条认领申请：该申请通过，其余申请自动失效，物品置为已认领，并通知所有申请人 */
  function approveClaim(id: number) {
    const claim = claims.value.find((entry) => entry.id === id)
    if (!claim || claim.status === '已通过' || claim.status === '已驳回') return
    const item = items.value.find((entry) => entry.id === claim.itemId)
    if (!item) return
    // 1) 该申请通过并写入发布者联系方式快照
    claim.status = '已通过'
    claim.publisherContact = item.contact?.trim() ?? ''
    // 2) 其余申请自动失效（置为已驳回）
    const others = claims.value.filter((entry) => entry.itemId === item.id && entry.id !== id && entry.status === '待审核')
    for (const other of others) {
      other.status = '已驳回'
      other.rejectionReason = '该物品已被其他同学认领'
    }
    // 3) 物品统一置为已认领
    item.status = '已认领'
    const approvedAt = new Date().toLocaleString('zh-CN')
    // 4) 通知成功认领的申请人（文案不含联系方式，引导前往"我的认领"查看）
    notifications.value.unshift({
      id: Date.now(),
      recipientId: claim.applicantId,
      recipientName: claim.applicant,
      message: '恭喜，您的认领申请已通过！请主动联系发布者交接物品（联系方式可在"我的认领"中查看）。',
      createdAt: approvedAt,
      read: false,
      kind: 'claim',
      itemId: item.id
    })
    // 5) 通知其余被拒绝的申请人
    for (const other of others) {
      notifications.value.unshift({
        id: Date.now() + other.id,
        recipientId: other.applicantId,
        recipientName: other.applicant,
        message: '很遗憾，该物品已被其他同学认领',
        createdAt: approvedAt,
        read: false,
        kind: 'claim',
        itemId: item.id
      })
    }
  }
  /** 发布者拒绝某条认领申请：仅将该申请置为已驳回并通知申请人，物品状态保持不变 */
  function rejectClaim(id: number) {
    const claim = claims.value.find((entry) => entry.id === id)
    if (!claim || claim.status === '已通过' || claim.status === '已驳回') return
    claim.status = '已驳回'
    claim.rejectionReason = '发布者未通过该认领申请'
    const item = items.value.find((entry) => entry.id === claim.itemId)
    if (!item) return
    notifications.value.unshift({
      id: Date.now(),
      recipientId: claim.applicantId,
      recipientName: claim.applicant,
      message: `很遗憾，您对【${item.title}】的认领申请未通过`,
      createdAt: new Date().toLocaleString('zh-CN'),
      read: false,
      kind: 'claim',
      itemId: item.id
    })
  }
  function markNotificationsRead(ids: number[]) {
    for (const notification of notifications.value) {
      if (ids.includes(notification.id)) notification.read = true
    }
  }
  /** 删除单条通知 */
  function removeNotification(id: number) {
    notifications.value = notifications.value.filter((notification) => notification.id !== id)
  }
  /** 清空当前登录用户收到的全部通知 */
  function clearNotifications() {
    notifications.value = notifications.value.filter(
      (notification) => notification.recipientId !== account.value && notification.recipientName !== currentUser.value.name
    )
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
  /** 删除物品：从 items 移除，并级联删除该物品关联的认领申请与线索（同步 localStorage） */
  function removeItem(id: number) {
    items.value = items.value.filter((entry) => entry.id !== id)
    claims.value = claims.value.filter((claim) => claim.itemId !== id)
    clues.value = clues.value.filter((clue) => clue.itemId !== id)
  }
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

  return { role, account, registeredUsers, activeRoute, isAuthenticated, notices, items, claims, clues, notifications, favoriteItemIds, likedItemIds, comments, currentUser, editingItemId, setRole, setActiveRoute, login, logout, authenticate, registerUser, changeUserRole, toggleUserDisabled, publish, beginEditItem, clearEditingItem, withdrawItem, confirmRecovered, submitClaim, submitClue, approve, reject, approveClaim, rejectClaim, removeNotification, clearNotifications, markNotificationsRead, markClueNotificationsRead, markItemCluesRead, toggleFavorite, toggleItemLike, addComment, toggleCommentLike, updateItem, toggleItemPublished, removeItem }
})
