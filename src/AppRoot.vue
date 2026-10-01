<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useAppStore } from './stores/app'

const router = useRouter()
const store = useAppStore()

// 会话失效（token 被禁用 / 账号被禁用 / 未登录）时由 http.ts 派发该事件
function onAuthExpired(e: Event) {
  const message = (e as CustomEvent<{ message?: string }>).detail?.message || '登录已失效，请重新登录'
  store.forceLogout()
  ElMessage.error(message)
  if (router.currentRoute.value.name !== 'login') router.push({ name: 'login' })
}

onMounted(() => {
  store.initSession() // 启动即校验会话有效性，无效则自动回退登录页
  window.addEventListener('auth:expired', onAuthExpired)
})
</script>

<template>
  <RouterView />
</template>
