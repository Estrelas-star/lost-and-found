<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAppStore, type Role } from '../stores/app'

const router = useRouter()
const route = useRoute()
const store = useAppStore()
const account = ref('')
const password = ref('')
const selectedRole = ref<Role>('student')
const errorMessage = ref('')

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
</script>

<template>
  <main class="login-page">
    <section class="login-intro">
      <div class="brand login-brand"><span class="brand-mark">拾</span><div><strong>拾光</strong><small>校园失物招领</small></div></div>
      <div class="login-copy"><span class="eyebrow">CAMPUS LOST & FOUND</span><h1>让每件物品，<br /><em>回到它的主人身边。</em></h1><p>发布、寻找、认领，校园里的每一次相遇都值得被记录。</p></div>
      <div class="login-stat"><strong>1,284</strong><span>件物品正在被认真寻找</span></div>
    </section>
    <section class="login-panel">
      <div class="login-box">
        <span class="eyebrow">WELCOME BACK</span>
        <h2>登录拾光</h2>
        <p class="login-description">使用校园账号进入你的工作台</p>
        <form @submit.prevent="submitLogin">
          <label>校园账号<input v-model="account" placeholder="用户名" autocomplete="username" /></label>
          <label>密码<input v-model="password" type="password" placeholder="请输入密码" autocomplete="current-password" /></label>
          <label>登录身份<select v-model="selectedRole"><option value="student">普通学生</option><option value="itemAdmin">失物招领管理员</option><option value="systemAdmin">系统管理员</option></select></label>
          <p v-if="errorMessage" class="login-error">{{ errorMessage }}</p>
          <button class="primary-btn login-btn" type="submit">进入工作台 →</button>
        </form>
        <small class="mock-hint">已接入真实后端，请使用注册过的账号登录</small>
      </div>
    </section>
  </main>
</template>
