<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { useAppStore } from '../stores/app'
import { uploadImage } from '../api/upload'
import { resolveImageUrl } from '../utils/image'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ close: [] }>()
const store = useAppStore()

const me = computed(() => store.currentUser)
const boundQQ = computed(() => (store as any).authUser?.qq || '')
const isBoundQQ = computed(() => !!(store.authUser && store.authUser.qq))

// —— 绑定 QQ ——
const qqGroup = '1056181967'
const qqCode = ref('')
const qq = ref('')
const sendingCode = ref(false)
const binding = ref(false)
async function sendQQCode() {
  if (!qq.value.trim()) { ElMessage.warning('请输入 QQ 号'); return }
  sendingCode.value = true
  try {
    await store.sendQQCode(Number(qq.value.trim()))
    ElMessage.success('验证码已发送到 QQ 群，请查收陈松发出的验证码')
  } catch (e) {
    ElMessage.warning('发送验证码失败：' + ((e as Error).message || '未知错误'))
  } finally {
    sendingCode.value = false
  }
}
async function confirmBindQQ() {
  if (!qq.value.trim()) { ElMessage.warning('请输入 QQ 号'); return }
  if (!qqCode.value.trim()) { ElMessage.warning('请输入收到的验证码'); return }
  binding.value = true
  try {
    await store.bindQQ(Number(qq.value.trim()), Number(qqCode.value.trim()))
    await store.initSession() // 刷新绑定的 QQ
    ElMessage.success('QQ 绑定成功')
    qqCode.value = ''
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    ElMessage.error(msg || '绑定失败，请确认验证码是否正确')
  } finally {
    binding.value = false
  }
}

// —— 修改资料 ——
const nickname = ref(me.value.name || '')
const realname = ref('')
const gender = ref<number | undefined>(undefined)
const savingProfile = ref(false)
async function saveProfile() {
  if (!nickname.value.trim()) { ElMessage.warning('昵称不能为空'); return }
  savingProfile.value = true
  try {
    await store.updateMyProfile({
      nickname: nickname.value.trim(),
      ...(realname.value.trim() ? { realname: realname.value.trim() } : {}),
      ...(gender.value !== undefined ? { gender: gender.value } : {}),
    })
    ElMessage.success('资料已更新')
  } catch (e) {
    ElMessage.error((e as Error).message || '资料更新失败')
  } finally {
    savingProfile.value = false
  }
}

// —— 更换头像 ——
const avatarUploading = ref(false)
const avatarUrl = computed(() => resolveImageUrl((store as any).authUser?.avatar))
async function onAvatarPick(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !file.type.startsWith('image/')) return
  avatarUploading.value = true
  try {
    const url = await uploadImage(file)
    await store.updateMyProfile({ avatar: url })
    ElMessage.success('头像已更新')
  } catch (e) {
    ElMessage.error((e as Error).message || '头像上传失败')
  } finally {
    avatarUploading.value = false
  }
}

const dialogVisible = computed({
  get: () => props.visible,
  set: (v: boolean) => { if (!v) emit('close') },
})
</script>

<template>
  <el-dialog v-model="dialogVisible" title="账号设置" width="520px" @close="emit('close')">
    <div class="us-section">
      <h3>绑定 QQ</h3>
      <p class="us-tip">认领物品需要绑定 QQ。请先加入 QQ 群 <b>{{ qqGroup }}</b>，再获取验证码完成绑定。</p>
      <div v-if="!isBoundQQ">
        <div class="us-row">
          <span class="us-current">当前绑定：{{ boundQQ || '未绑定' }}</span>
          <a class="us-link" :href="`https://qm.qq.com/q/${qqGroup}`" target="_blank" rel="noopener">加入 QQ 群</a>
        </div>
        <div class="us-row">
          <el-input v-model="qq" placeholder="输入你的 QQ 号" style="width:180px" />
          <el-button size="small" :loading="sendingCode" @click="sendQQCode">发送验证码</el-button>
        </div>
        <div class="us-row">
          <el-input v-model="qqCode" placeholder="输入陈松发来的验证码" style="width:200px" />
          <el-button size="small" type="primary" :loading="binding" @click="confirmBindQQ">确认绑定</el-button>
        </div>
      </div>
      <p v-else class="us-bound">你已绑定 QQ：<b>{{ boundQQ }}</b>，无需重复绑定。</p>
    </div>

    <el-divider />

    <div class="us-section">
      <h3>修改资料</h3>
      <div class="us-form">
        <label>昵称<input v-model="nickname" placeholder="昵称" /></label>
        <label>真实姓名<input v-model="realname" placeholder="真实姓名（选填）" /></label>
        <label>性别
          <el-select v-model="gender" placeholder="不修改" clearable style="width:100%">
            <el-option label="男" :value="1" />
            <el-option label="女" :value="2" />
            <el-option label="保密" :value="0" />
          </el-select>
        </label>
        <el-button type="primary" :loading="savingProfile" @click="saveProfile">保存资料</el-button>
      </div>
    </div>

    <el-divider />

    <div class="us-section">
      <h3>更换头像</h3>
      <div class="us-avatar-row">
        <div class="us-avatar">
          <img v-if="avatarUrl" :src="avatarUrl" alt="头像" />
          <span v-else>{{ me.name.slice(0, 1) }}</span>
        </div>
        <label class="us-avatar-btn">
          <input type="file" accept="image/*" :disabled="avatarUploading" @change="onAvatarPick" />
          {{ avatarUploading ? '上传中…' : '上传 / 更换头像' }}
        </label>
      </div>
    </div>
  </el-dialog>
</template>

<style scoped>
.us-section h3 { margin: 0 0 10px; font-size: 15px; }
.us-tip { margin: 0 0 10px; color: #75817d; font-size: 12px; line-height: 1.6; }
.us-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 8px; }
.us-current { font-size: 13px; color: #4b5563; }
.us-link { color: var(--green); font-size: 13px; }
.us-bound { margin: 0; font-size: 13px; color: #4b5563; }
.us-form { display: flex; flex-direction: column; gap: 12px; max-width: 320px; }
.us-form label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: #4b5563; }
.us-form input { border: 1px solid var(--line); border-radius: 7px; padding: 10px 12px; outline: 0; font-size: 13px; }
.us-avatar-row { display: flex; align-items: center; gap: 16px; }
.us-avatar { width: 64px; height: 64px; border-radius: 50%; overflow: hidden; display: grid; place-items: center; background: #d9eee6; color: var(--green); font-size: 24px; font-weight: 700; }
.us-avatar img { width: 100%; height: 100%; object-fit: cover; }
.us-avatar-btn { display: inline-flex; align-items: center; padding: 9px 14px; border: 1px dashed #c8d7cd; border-radius: 8px; color: var(--green); font-size: 13px; cursor: pointer; }
.us-avatar-btn input { display: none; }
/* 主题绿色：确认绑定 / 保存资料 按钮（含 hover 深绿，不回蓝） */
.us-section :deep(.el-button--primary) {
  --el-button-bg-color: var(--el-color-primary);
  --el-button-border-color: var(--el-color-primary);
  --el-button-hover-bg-color: var(--el-color-primary-dark-2);
  --el-button-hover-border-color: var(--el-color-primary-dark-2);
  --el-button-active-bg-color: var(--el-color-primary-dark-2);
  --el-button-active-border-color: var(--el-color-primary-dark-2);
  --el-button-text-color: #fff;
  --el-button-hover-text-color: #fff;
  --el-button-active-text-color: #fff;
}
.us-section :deep(.el-button--primary.is-loading) {
  --el-button-bg-color: var(--el-color-primary);
  --el-button-border-color: var(--el-color-primary);
}
/* 发送验证码（次要按钮）hover 文字保持绿色主题 */
.us-section :deep(.el-button:hover) { color: var(--el-color-primary); }
</style>
