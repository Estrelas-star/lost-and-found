import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

export type Role = 'student' | 'itemAdmin' | 'systemAdmin'
export type ItemType = 'lost' | 'found'
export type ItemStatus = '待审核' | '招领中' | '待认领' | '已认领' | '已驳回' | '已关闭'

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

export const useAppStore = defineStore('app', () => {
  const role = ref<Role>((localStorage.getItem('role') as Role) || 'student')
  const registeredUsers = ref<User[]>(seedUsers())
  const activeRoute = ref('home')
  const isAuthenticated = ref(localStorage.getItem('auth_token') === 'mock-token')
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

  const currentUser = computed(() => registeredUsers.value.find((u) => u.account === account.value) ?? seedUsers()[0])
  const pendingCount = computed(() => items.value.filter((item) => item.status === '待审核').length + claims.value.filter((claim) => claim.status === '审核中').length)

  function persistUsers() {
    localStorage.setItem('registered_users', JSON.stringify(registeredUsers.value))
  }

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
  function publish(item: Omit<Item, 'id' | 'author' | 'date' | 'status'> & { status?: ItemStatus }) {
    items.value.unshift({ id: Date.now(), ...item, status: role.value === 'student' ? '待审核' : item.status || '待审核', author: currentUser.value.name, date: '刚刚' })
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

  return { role, account, registeredUsers, activeRoute, isAuthenticated, notices, items, claims, favoriteItemIds, likedItemIds, comments, currentUser, pendingCount, setRole, setActiveRoute, login, logout, authenticate, registerUser, changeUserRole, toggleUserDisabled, publish, submitClaim, approve, reject, updateClaim, toggleFavorite, toggleItemLike, addComment, toggleCommentLike, updateItem, toggleItemPublished, removeItem }
})
