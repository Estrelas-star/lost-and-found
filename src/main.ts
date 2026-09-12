import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import AppRoot from './AppRoot.vue'
import router from './router'
import './styles.css'
import 'element-plus/dist/index.css'

const app = createApp(AppRoot)
app.use(createPinia())
app.use(ElementPlus)
app.use(router)
app.mount('#app')
