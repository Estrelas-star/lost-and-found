import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import App from './App.vue'
import Login from './views/Login.vue'
import { ElMessage } from 'element-plus'
import { useAppStore, type Role } from './stores/app'
import { navItems } from './navigation'

const allRoles: Role[] = ['student', 'itemAdmin', 'systemAdmin']
const roleHome: Record<Role, string> = {
  student: 'home',
  itemAdmin: 'audit',
  systemAdmin: 'dashboard'
}

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/app' },
  { path: '/login', name: 'login', component: Login, meta: { guestOnly: true } },
  { path: '/app', name: 'app', component: App, meta: { requiresAuth: true, roles: allRoles } },
  { path: '/app/home', name: 'home', component: App, meta: { requiresAuth: true, roles: ['student'], page: 'home' } },
  { path: '/app/publish', name: 'publish', component: App, meta: { requiresAuth: true, roles: ['student'], page: 'publish' } },
  { path: '/app/posts', name: 'posts', component: App, meta: { requiresAuth: true, roles: ['student'], page: 'posts' } },
  { path: '/app/claims', name: 'claims', component: App, meta: { requiresAuth: true, roles: ['student'], page: 'claims' } },
  { path: '/app/audit', name: 'audit', component: App, meta: { requiresAuth: true, roles: ['itemAdmin'], page: 'audit' } },
  { path: '/app/manage', name: 'manage', component: App, meta: { requiresAuth: true, roles: ['itemAdmin'], page: 'manage' } },
  { path: '/app/dashboard', name: 'dashboard', component: App, meta: { requiresAuth: true, roles: ['systemAdmin'], page: 'dashboard' } },
  { path: '/app/users', name: 'users', component: App, meta: { requiresAuth: true, roles: ['systemAdmin'], page: 'users' } },
  { path: '/app/notices', name: 'notices', component: App, meta: { requiresAuth: true, roles: ['systemAdmin'], page: 'notices' } },
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
    return { name: roleHome[store.role] }
  }

  const requiredRoles = to.matched
    .flatMap((record) => (record.meta.roles as Role[] | undefined) || [])

  if (requiredRoles.length > 0 && !requiredRoles.includes(store.role)) {
    ElMessage.error('无权限访问')
    return { name: roleHome[store.role] }
  }

  if (to.name === 'app') {
    return { name: roleHome[store.role] }
  }
})

export default router
