import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import App from './App.vue'
import Login from './views/Login.vue'
import { useAppStore } from './stores/app'

export const navItems = {
  student: [
    { key: 'home', label: '发现物品', icon: '⌂' },
    { key: 'publish', label: '发布信息', icon: '+' },
    { key: 'posts', label: '我的发布', icon: '▤' },
    { key: 'claims', label: '我的认领', icon: '♡' }
  ],
  itemAdmin: [
    { key: 'audit', label: '审核中心', icon: '✓' },
    { key: 'manage', label: '物品管理', icon: '▦' }
  ],
  systemAdmin: [
    { key: 'dashboard', label: '数据总览', icon: '◫' },
    { key: 'users', label: '账号管理', icon: '◎' },
    { key: 'notices', label: '公告管理', icon: '▱' }
  ]
} as const

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/app' },
  { path: '/login', name: 'login', component: Login, meta: { guestOnly: true } },
  { path: '/app', name: 'app', component: App, meta: { requiresAuth: true } },
  { path: '/:pathMatch(.*)*', redirect: '/app' }
]

export const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to) => {
  const store = useAppStore()

  if (to.meta.requiresAuth && !store.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  if (to.meta.guestOnly && store.isAuthenticated) {
    return { name: 'app' }
  }
})

export default router
