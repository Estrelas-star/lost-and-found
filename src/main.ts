import { createApp } from 'vue'
import { createPinia } from 'pinia'
import AppRoot from './AppRoot.vue'
import router from './router'
import './styles.css'

const app = createApp(AppRoot)
app.use(createPinia())
app.use(router)
app.mount('#app')
