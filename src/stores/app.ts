import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

export type Role = 'student' | 'itemAdmin' | 'systemAdmin'
export type ItemType = 'lost' | 'found'
export type ItemStatus = '待审核' | '招领中' | '待认领' | '已认领'

export interface User {
  name: string
  id: string
  label: string
}

export interface Item {
  id: number
  type: ItemType
  title: string
  category: string
  location: string
  date: string
  status: ItemStatus
  author: string
  color: string
  icon: string
  desc: string
  contact?: string
}

export interface Claim {
  id: number
  item: string
  applicant: string
  date: string
  status: string
}

const users: Record<Role, User> = {
  student: { name: '林知夏', id: '2023010218', label: '普通学生' },
  itemAdmin: { name: '赵老师', id: 'LF-ADMIN-01', label: '失物招领管理员' },
  systemAdmin: { name: '陈老师', id: 'SYS-ADMIN-01', label: '系统管理员' }
}

export const useAppStore = defineStore('app', () => {
  const role = ref<Role>((localStorage.getItem('role') as Role) || 'student')
  const activeRoute = ref('home')
  const isAuthenticated = ref(localStorage.getItem('auth_token') === 'mock-token')
  const notices = ref<any[]>([
    { id: 1, title: '期末周拾光服务时间调整通知', date: '2026-06-12', tag: '重要' },
    { id: 2, title: '毕业季物品集中认领活动开始啦', date: '2026-06-08', tag: '活动' }
  ])
  const items = ref<Item[]>([
    { id: 1, type: 'found', title: '黑色 AirPods Pro 2', category: '数码', location: '图书馆三楼', date: '06-15', status: '待认领', author: '李同学', color: 'ink', icon: '◉', desc: '在靠窗自习区拾到，已交至图书馆服务台。' },
    { id: 2, type: 'lost', title: '蓝色帆布包', category: '日用', location: '南区食堂', date: '06-14', status: '招领中', author: '周同学', color: 'blue', icon: '▰', desc: '包内有一本《设计心理学》和校园卡。' },
    { id: 3, type: 'found', title: '校园卡 · 陈知行', category: '证件', location: '操场看台', date: '06-14', status: '待认领', author: '拾光志愿者', color: 'mint', icon: '▣', desc: '已核验姓名，等待失主联系。' },
    { id: 4, type: 'lost', title: '银色保温杯', category: '日用', location: '文科楼 204', date: '06-13', status: '招领中', author: '王同学', color: 'coral', icon: '◒', desc: '杯身有一枚小树贴纸，落款为 W。' },
    { id: 5, type: 'found', title: '一串钥匙', category: '其他', location: '西门快递站', date: '06-12', status: '已认领', author: '拾光志愿者', color: 'yellow', icon: '⌘', desc: '三把钥匙，附有蓝色小挂件。' }
  ])
  const claims = ref<Claim[]>([{ id: 1, item: '黑色 AirPods Pro 2', applicant: '林同学', date: '06-15 14:20', status: '审核中' }])

  const currentUser = computed(() => users[role.value])
  const pendingCount = computed(() => items.value.filter((item) => item.status === '待审核').length + claims.value.filter((claim) => claim.status === '审核中').length)

  function setRole(nextRole: Role) {
    role.value = nextRole
    localStorage.setItem('role', nextRole)
  }
  function setActiveRoute(route: string) { activeRoute.value = route }
  function login(nextRole: Role) {
    setRole(nextRole)
    isAuthenticated.value = true
    localStorage.setItem('auth_token', 'mock-token')
  }
  function logout() {
    isAuthenticated.value = false
    localStorage.removeItem('auth_token')
    localStorage.removeItem('role')
  }
  function publish(item: Omit<Item, 'id' | 'author' | 'date' | 'status'> & { status?: ItemStatus }) {
    items.value.unshift({ id: Date.now(), ...item, status: role.value === 'student' ? '待审核' : item.status || '待审核', author: currentUser.value.name, date: '刚刚' })
  }
  function submitClaim(item: Item) { claims.value.unshift({ id: Date.now(), item: item.title, applicant: currentUser.value.name, date: '刚刚', status: '审核中' }) }
  function approve(id: number) { const item = items.value.find((entry) => entry.id === id); if (item) item.status = '招领中' }
  function updateClaim(id: number, status: string) { const claim = claims.value.find((entry) => entry.id === id); if (claim) claim.status = status }

  return { role, activeRoute, isAuthenticated, notices, items, claims, currentUser, pendingCount, setRole, setActiveRoute, login, logout, publish, submitClaim, approve, updateClaim }
})
