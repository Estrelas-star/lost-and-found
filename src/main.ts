import { createApp } from 'vue' //从 vue 框架中引入了 createApp 函数，用于创建一个 Vue 应用实例。
import { createPinia } from 'pinia' //从 pinia 引入了 createPinia 函数。Pinia 是 Vue 3 官方推荐的状态管理库，用于全局数据共享。
import ElementPlus from 'element-plus' //引入了 ElementPlus，这是一个基于 Vue 3 的 UI 组件库（类似 Ant Design 或 Vuetify）。
import AppRoot from './AppRoot.vue' //引入了应用的最外层（根）组件，通常命名为 App.vue 或这里的 AppRoot.vue。
import router from './router' //引入了路由实例（通常由 Vue Router 创建并导出）。
import './styles.css'
import 'element-plus/dist/index.css' //第一行引入了项目自定义的全局样式，第二行引入了 ElementPlus UI 组件库的默认样式。

const app = createApp(AppRoot) //使用之前引入的根组件 AppRoot 创建了一个 Vue 应用实例，并将其存储在 app 变量中。
app.use(createPinia()) //在应用中注册 Pinia 状态管理插件。createPinia() 会创建一个新的 Pinia 实例。
app.use(ElementPlus) //在应用中注册 ElementPlus 组件库，这样就可以在 Vue 模板中使用 <el-button> 等组件了。
app.use(router) //在应用中注册路由插件，使应用支持路由跳转功能。
app.mount('#app') //将配置好的 Vue 应用实例挂载到 HTML 页面中 id 为 app 的 DOM 元素上。此时，Vue 会接管这个 DOM 元素，将 AppRoot 组件及其子组件渲染到页面上。
