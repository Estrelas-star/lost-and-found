<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAppStore } from '../stores/app'
import type { BroadcastPayload, NotificationDetail, NotificationItem } from '../api/notification'

const store = useAppStore()
const emit = defineEmits<{ 'open-item': [number] }>()

const open = ref(false)
const detail = ref<NotificationDetail | null>(null)
const detailVisible = ref(false)
const broadcastVisible = ref(false)

const unreadCount = computed(() => store.unreadCount)
const list = computed(() => store.notifications)
const canBroadcast = computed(() => store.role !== 'student')
// 后端批量删除会跳过「管理端群发给自己的那条」（user_id = admin_id），前端也不应把它做成可删
const myId = computed(() => store.authUser?.id ?? 0)
function isSelfSent(item: NotificationItem) { return item.admin_id !== 0 && item.admin_id === myId.value }

const TYPE_LABELS: Record<number, string> = {
  0: '系统通知', 1: '物品匹配', 2: '认领申请', 3: '认领结果', 4: '评论回复', 5: '积分变动', 6: '商品兑换',
}
function typeLabel(t: number) { return TYPE_LABELS[t] ?? '通知' }

function formatTime(iso: string) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const hm = pad(d.getHours()) + ':' + pad(d.getMinutes())
  if (d.toDateString() === now.toDateString()) return '今天 ' + hm
  if (d.toDateString() === new Date(now.getTime() - 86400000).toDateString()) return '昨天 ' + hm
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${hm}`
}

async function toggle() {
  open.value = !open.value
  if (open.value) await store.fetchNotifications({ limit: 20, offset: 0 })
}
function close() { open.value = false }

async function onItemClick(item: NotificationItem) {
  const detailData = await store.openNotification(item.id)
  if (detailData) { detail.value = detailData; detailVisible.value = true; open.value = false }
}

async function markAllRead() {
  try {
    // 列表只显示最近 20 条，未读总数可能更多 —— 先分页取出「全部未读」再标记
    // （api 层已按后端限制 200/次自动分批）
    const ids = await store.fetchAllUnreadIds()
    if (!ids.length) { ElMessage.info('没有未读通知'); return }
    await store.markNotificationsRead(ids)
    ElMessage.success(`已将 ${ids.length} 条通知标为已读`)
  } catch (e) {
    ElMessage.error((e as Error).message || '标记已读失败，请稍后重试')
  }
}

async function deleteItem(item: NotificationItem) {
  if (isSelfSent(item)) { ElMessage.info('这是你自己群发的通知，系统不支持删除'); return }
  try {
    await ElMessageBox.confirm('确定删除这条通知吗？', '删除通知', { type: 'warning' })
  } catch { return }
  try {
    await store.removeNotifications([item.id])
    ElMessage.success('已删除')
  } catch (e) {
    ElMessage.error((e as Error).message || '删除失败，请稍后重试')
  }
}

function openRelated() {
  if (detail.value?.related_id) {
    emit('open-item', detail.value.related_id)
    detailVisible.value = false
  }
}

// —— 管理员广播 ——
const bcType = ref(0)
const bcTitle = ref('')
const bcContent = ref('')
const bcSendAll = ref(true)
const bcUserIds = ref('')
const bcSending = ref(false)
async function sendBroadcast() {
  if (!bcTitle.value.trim()) { ElMessage.warning('请填写通知标题'); return }
  if (!bcContent.value.trim()) { ElMessage.warning('请填写通知内容'); return }
  // 指定用户时后端要求：user_ids 非空、单次 ≤1000（空 / 全无效 / 超 1000 一律 → 1）
  let targetIds: number[] = []
  if (!bcSendAll.value) {
    targetIds = bcUserIds.value.split(/[,\s]+/).map((s) => Number(s.trim())).filter((n) => !isNaN(n) && n > 0)
    if (!targetIds.length) { ElMessage.warning('请填写至少一个用户 ID，或勾选「发送给所有用户」'); return }
    if (targetIds.length > 1000) { ElMessage.warning('单次最多指定 1000 个用户，请分批发送'); return }
  }
  bcSending.value = true
  try {
    const payload: BroadcastPayload = {
      type: bcType.value,
      title: bcTitle.value.trim(),
      content: bcContent.value.trim(),
      send_to_all: bcSendAll.value,
    }
    // 已核对后端 NotificationService.Send 校验：
    //   send_to_all=true  → user_ids 必须为空/不传（同传 → 1）
    //   send_to_all=false → 必须给出非空 user_ids（空/全无效 → 1）
    // 因此这里只在「指定用户」时补 user_ids，其余场合不带该字段
    if (!bcSendAll.value) payload.user_ids = targetIds
    await store.broadcastNotification(payload)
    ElMessage.success('通知已发送')
    broadcastVisible.value = false
    bcTitle.value = ''
    bcContent.value = ''
    bcUserIds.value = ''
    bcSendAll.value = true
    bcType.value = 0
  } catch (e) {
    ElMessage.error((e as Error).message || '发送失败')
  } finally { bcSending.value = false }
}
</script>

<template>
  <div class="notif-wrap">
    <button class="notif-bell" :class="{ active: open }" @click="toggle" title="通知">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      <i v-if="unreadCount" class="notif-badge">{{ unreadCount > 99 ? '99+' : unreadCount }}</i>
    </button>

    <div v-if="open" class="notif-mask" @click="close"></div>
    <div v-if="open" class="notif-panel" @click.stop>
      <div class="notif-head">
        <strong>通知</strong>
        <div class="notif-head-actions">
          <button class="notif-link" @click="markAllRead">全部已读</button>
          <button v-if="canBroadcast" class="notif-link" @click="broadcastVisible = true">发送通知</button>
          <button class="notif-close" @click="close">×</button>
        </div>
      </div>
      <div class="notif-list">
        <div v-if="!list.length" class="notif-empty">暂时没有通知</div>
        <div v-for="item in list" :key="item.id" class="notif-item" :class="{ unread: !item.is_read }" @click="onItemClick(item)">
          <span class="notif-dot" v-if="!item.is_read"></span>
          <div class="notif-item-main">
            <div class="notif-item-top">
              <span class="notif-tag">{{ typeLabel(item.type) }}</span>
              <span class="notif-time">{{ formatTime(item.created_at) }}</span>
            </div>
            <div class="notif-title">{{ item.title }}</div>
          </div>
          <button v-if="!isSelfSent(item)" class="notif-del" @click.stop="deleteItem(item)" title="删除">×</button>
          <span v-else class="notif-self-mark" title="这是你自己群发的通知，系统不支持删除">已发</span>
        </div>
      </div>
    </div>
  </div>

  <el-dialog v-model="detailVisible" title="通知详情" width="460px">
    <div v-if="detail" class="notif-detail">
      <div class="notif-detail-top">
        <span class="notif-tag">{{ typeLabel(detail.type) }}</span>
        <span class="notif-time">{{ formatTime(detail.created_at) }}</span>
      </div>
      <h3 class="notif-detail-title">{{ detail.title }}</h3>
      <p class="notif-detail-content">{{ detail.content }}</p>
      <button v-if="detail.related_id" class="notif-related" @click="openRelated">查看相关物品 →</button>
    </div>
  </el-dialog>

  <el-dialog v-model="broadcastVisible" title="发送通知（管理员）" width="480px">
    <div class="notif-bc">
      <label>类型
        <el-select v-model="bcType" style="width:100%">
          <el-option v-for="(label, key) in TYPE_LABELS" :key="key" :label="label" :value="Number(key)" />
        </el-select>
      </label>
      <label>标题<input v-model="bcTitle" placeholder="通知标题（≤100 字）" maxlength="100" /></label>
      <label>内容<textarea v-model="bcContent" rows="4" placeholder="通知内容"></textarea></label>
      <label class="notif-bc-check"><input type="checkbox" v-model="bcSendAll" /> 发送给所有用户</label>
      <label v-if="!bcSendAll">指定用户 ID（逗号或空格分隔）
        <textarea v-model="bcUserIds" rows="2" placeholder="例如：1, 2, 3"></textarea>
      </label>
    </div>
    <template #footer>
      <el-button @click="broadcastVisible = false">取消</el-button>
      <el-button type="primary" :loading="bcSending" @click="sendBroadcast">发送</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.notif-wrap { position: relative; display: inline-flex; }
.notif-bell { position: relative; width: 38px; height: 38px; border-radius: 10px; border: 1px solid var(--line, #e3e8e4); background: #f4faf7; color: var(--green, #42b983); display: grid; place-items: center; cursor: pointer; transition: all .2s; }
.notif-bell:hover, .notif-bell.active { background: #e7f5ef; border-color: #cfe3da; }
.notif-badge { position: absolute; top: -6px; right: -6px; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; background: #e06c75; color: #fff; font-size: 11px; font-style: normal; line-height: 18px; text-align: center; box-shadow: 0 0 0 2px #fff; }
.notif-mask { position: fixed; inset: 0; z-index: 40; }
.notif-panel { position: absolute; top: 46px; right: 0; width: 340px; max-height: 70vh; background: #fff; border: 1px solid #e3e8e4; border-radius: 14px; box-shadow: 0 18px 40px rgba(66,185,131,.18); display: flex; flex-direction: column; overflow: hidden; z-index: 50; }
.notif-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border-bottom: 1px solid #eef1ee; }
.notif-head-actions { display: flex; align-items: center; gap: 10px; }
.notif-link { background: none; border: none; color: var(--green, #42b983); font-size: 12px; cursor: pointer; }
.notif-close { background: none; border: none; font-size: 18px; color: #9aa6a1; cursor: pointer; line-height: 1; }
.notif-list { overflow-y: auto; padding: 6px; }
.notif-empty { padding: 30px; text-align: center; color: #9aa6a1; font-size: 13px; }
.notif-item { display: flex; align-items: flex-start; gap: 8px; padding: 10px; border-radius: 10px; cursor: pointer; position: relative; }
.notif-item:hover { background: #f4faf7; }
.notif-item.unread { background: #f0f8f4; }
.notif-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--green, #42b983); margin-top: 5px; flex: 0 0 auto; }
.notif-item-main { flex: 1; min-width: 0; }
.notif-item-top { display: flex; align-items: center; gap: 8px; margin-bottom: 3px; }
.notif-tag { font-size: 11px; color: var(--green, #42b983); background: #e7f5ef; padding: 1px 7px; border-radius: 6px; }
.notif-time { font-size: 11px; color: #9aa6a1; }
.notif-title { font-size: 13px; color: #2f3a36; line-height: 1.5; word-break: break-word; }
.notif-del { background: none; border: none; color: #c2ccc7; font-size: 16px; cursor: pointer; line-height: 1; opacity: 0; }
.notif-item:hover .notif-del { opacity: 1; }
/* 「你自己群发的通知」不可删除：用只读标记替代删除按钮，避免点击后假成功 */
.notif-self-mark { flex: 0 0 auto; align-self: center; font-size: 10px; color: #a8b5af; background: #f4f7f5; border: 1px solid #e3eae6; border-radius: 6px; padding: 1px 6px; }
.notif-detail-top { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.notif-detail-title { margin: 0 0 10px; font-size: 16px; color: #2f3a36; }
.notif-detail-content { margin: 0; font-size: 13px; color: #4b5563; line-height: 1.7; white-space: pre-wrap; }
.notif-related { margin-top: 14px; background: none; border: none; color: var(--green, #42b983); font-size: 13px; cursor: pointer; padding: 0; }
.notif-bc { display: flex; flex-direction: column; gap: 12px; }
.notif-bc label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: #4b5563; }
.notif-bc input:not([type="checkbox"]), .notif-bc textarea { border: 1px solid #d8e0db; border-radius: 7px; padding: 9px 11px; outline: 0; font-size: 13px; font-family: inherit; }
.notif-bc textarea { resize: vertical; }
.notif-bc-check { flex-direction: row !important; align-items: center; gap: 8px !important; }
</style>
