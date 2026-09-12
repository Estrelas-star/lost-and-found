import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import { useAppStore } from './stores/app'
import './styles.css'

const router = createRouter({
  history: createWebHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: App }]
})

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')

const store = useAppStore()
router.afterEach(() => store.setActiveRoute(window.location.hash || window.location.pathname))
