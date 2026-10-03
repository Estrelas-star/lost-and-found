<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAppStore } from '../stores/app'

const router = useRouter()
const route = useRoute()
const store = useAppStore()
const account = ref('')
const password = ref('')
const errorMessage = ref('')
const mode = ref<'login' | 'register'>('login')
const nickname = ref('')
const regError = ref('')
function switchMode(m: 'login' | 'register') { mode.value = m; errorMessage.value = ''; regError.value = '' }

async function submitLogin() {
  errorMessage.value = ''
  if (!account.value || !password.value) {
    errorMessage.value = '请输入账号和密码'
    return
  }
  try {
    await store.login(account.value, password.value)   // 真登录：传真实账号密码
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/app'
    router.push(redirect)
  } catch (e) {
    errorMessage.value = (e as Error).message || '登录失败，请检查账号或密码'
  }
}

async function submitRegister() {
  regError.value = ''
  if (!nickname.value.trim()) { regError.value = '请输入昵称'; return }
  if (!account.value || !password.value) { regError.value = '请输入账号和密码'; return }
  try {
    await store.register(account.value, password.value, nickname.value.trim())
    await store.login(account.value, password.value)
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/app'
    router.push(redirect)
  } catch (e) {
    regError.value = (e as Error).message || '注册失败，请稍后重试'
  }
}

onMounted(() => { store.fetchItemCount() })
</script>

<template>
  <main class="login-page">
    <section class="login-intro">
      <div class="brand login-brand"><span class="brand-mark">拾</span><div><strong>拾光</strong><small>校园失物招领</small></div></div>
      <div class="login-copy"><span class="eyebrow">CAMPUS LOST & FOUND</span><h1>让每件物品，<br /><em>回到它的主人身边。</em></h1><p>发布、寻找、认领，校园里的每一次相遇都值得被记录。</p></div>
      <div class="login-stat"><strong>{{ store.itemCount || '1,284' }}</strong><span>件物品正在被认真寻找</span></div>
    </section>
    <section class="login-panel">
      <div class="login-box">
        <span class="eyebrow">{{ mode === 'login' ? 'WELCOME BACK' : 'JOIN US' }}</span>
        <h2>{{ mode === 'login' ? '登录拾光' : '注册账号' }}</h2>
        <p class="login-description">{{ mode === 'login' ? '使用校园账号进入你的工作台' : '创建你的校园账号，开始寻找与认领' }}</p>
        <form v-if="mode === 'login'" @submit.prevent="submitLogin">
          <label>校园账号<input v-model="account" placeholder="用户名" autocomplete="username" /></label>
          <label>密码<input v-model="password" type="password" placeholder="请输入密码" autocomplete="current-password" /></label>
          <p v-if="errorMessage" class="login-error">{{ errorMessage }}</p>
          <button class="primary-btn login-btn" type="submit">进入工作台 →</button>
          <p class="login-switch">还没有账号？<a @click="switchMode('register')">立即注册</a></p>
        </form>
        <form v-else @submit.prevent="submitRegister">
          <label>昵称<input v-model="nickname" placeholder="昵称（2-32 字）" autocomplete="nickname" /></label>
          <label>校园账号<input v-model="account" placeholder="用户名" autocomplete="username" /></label>
          <label>密码<input v-model="password" type="password" placeholder="密码（8-20 位，含大小写+数字+符号）" autocomplete="new-password" /></label>
          <p v-if="regError" class="login-error">{{ regError }}</p>
          <button class="primary-btn login-btn" type="submit">注册并进入 →</button>
          <p class="login-switch">已有账号？<a @click="switchMode('login')">去登录</a></p>
        </form>
      </div>
    </section>
  </main>
</template>
