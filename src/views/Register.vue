<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useAppStore } from '../stores/app'

const router = useRouter()
const store = useAppStore()
const form = ref({ account: '', password: '', confirmPassword: '', name: '', contact: '' })
const errorMessage = ref('')

function submitRegister() {
  errorMessage.value = ''
  const { account, password, confirmPassword, name, contact } = form.value

  if (!account.trim() || !password || !confirmPassword || !name.trim() || !contact.trim()) {
    errorMessage.value = '请完整填写所有字段'
    return
  }
  if (password.length < 6) {
    errorMessage.value = '密码至少 6 位'
    return
  }
  if (password !== confirmPassword) {
    errorMessage.value = '两次输入的密码不一致'
    return
  }

  const result = store.registerUser({ account: account.trim(), password, name: name.trim(), contact: contact.trim() })
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }

  ElMessage.success('注册成功，请登录')
  router.replace({ name: 'login' })
}
</script>

<template>
  <main class="login-page">
    <section class="login-intro">
      <div class="brand login-brand"><span class="brand-mark">拾</span><div><strong>拾光</strong><small>校园失物招领</small></div></div>
      <div class="login-copy"><span class="eyebrow">CAMPUS LOST & FOUND</span><h1>加入拾光，<br /><em>让每一件物品都能回家。</em></h1><p>注册一个账号，发布、寻找、认领，让校园里的每一次相遇都被认真对待。</p></div>
      <div class="login-stat"><strong>1,284</strong><span>件物品正在被认真寻找</span></div>
    </section>
    <section class="login-panel">
      <div class="login-box">
        <span class="eyebrow">CREATE ACCOUNT</span>
        <h2>注册拾光</h2>
        <p class="login-description">只需几步，开启你的失物招领之旅</p>
        <form @submit.prevent="submitRegister">
          <label>账号<input v-model="form.account" placeholder="设置登录账号" autocomplete="username" /></label>
          <label>密码<input v-model="form.password" type="password" placeholder="至少 6 位" autocomplete="new-password" /></label>
          <label>确认密码<input v-model="form.confirmPassword" type="password" placeholder="请再次输入密码" autocomplete="new-password" /></label>
          <label>真实姓名<input v-model="form.name" placeholder="请输入真实姓名" /></label>
          <label>联系方式<input v-model="form.contact" placeholder="请输入手机号 / 微信" /></label>
          <p v-if="errorMessage" class="login-error">{{ errorMessage }}</p>
          <button class="primary-btn login-btn" type="submit">注册并返回登录 →</button>
        </form>
        <button class="register-link" type="button" @click="router.replace({ name: 'login' })">已有账号？去登录</button>
      </div>
    </section>
  </main>
</template>