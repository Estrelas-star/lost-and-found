<script setup lang="ts">
// 顶栏「公告栏」：与「通知」并列的公告入口
// 定位：首页提示条（notice-strip）只是“看一眼”的提醒——同学点 × 后不再出现在主页，
//       但公告本身不会丢，随时可在这里回看全部历史公告。
// 数据：公开接口 GET /announcement（store.notices，置顶优先）；点开详情走 GET /announcement/:id（浏览量 +1）
// 已读：公告无服务端已读接口，用 localStorage 记录「已看 id」控制红点角标（store.readNoticeIds）
import { computed, ref } from 'vue'
import { useAppStore } from '../stores/app'
import { getAnnouncementDetail, type AnnouncementItem } from '../api/announcement'
import { renderMarkdown } from '../utils/markdown'

const store = useAppStore()

const open = ref(false)
const detail = ref<AnnouncementItem | null>(null)
const detailVisible = ref(false)
const loadingDetail = ref(false)

const list = computed(() => store.notices)
const unreadCount = computed(() => store.unreadNoticeCount)

const TYPE_LABELS: Record<number, string> = { 0: '系统公告', 1: '活动公告', 2: '维护通知', 3: '其他' }
function typeLabel(t: number) { return TYPE_LABELS[t] ?? '公告' }

function formatTime(iso?: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return String(iso).slice(0, 10)
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const hm = pad(d.getHours()) + ':' + pad(d.getMinutes())
  if (d.toDateString() === now.toDateString()) return '今天 ' + hm
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${hm}`
}

async function toggle() {
  open.value = !open.value
  if (open.value) await store.fetchNotices()
}
function close() { open.value = false }

async function onItemClick(item: AnnouncementItem) {
  store.markNoticeRead(item.id)
  open.value = false
  detail.value = item          // 先用列表里已有的内容秒开
  detailVisible.value = true
  loadingDetail.value = true
  try {
    const res = await getAnnouncementDetail(item.id) // 详情接口：拿全文并使浏览量 +1
    if (res.data) detail.value = res.data
  } catch { /* 详情拉取失败不影响已展示的内容 */ }
  finally { loadingDetail.value = false }
}
</script>

<template>
  <div class="ann-wrap">
    <button class="ann-bell" :class="{ active: open }" @click="toggle" title="公告栏">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 11v2a1 1 0 0 0 1 1h2l3.5 3.5A1 1 0 0 0 11 18V6a1 1 0 0 0-1.5-.86L6 8H4a1 1 0 0 0-1 1z" />
        <path d="M15.5 8.5a5 5 0 0 1 0 7" />
        <path d="M18.5 5.5a9 9 0 0 1 0 13" />
      </svg>
      <i v-if="unreadCount" class="ann-badge">{{ unreadCount > 99 ? '99+' : unreadCount }}</i>
    </button>

    <div v-if="open" class="ann-mask" @click="close"></div>
    <div v-if="open" class="ann-panel" @click.stop>
      <div class="ann-head">
        <strong>公告栏</strong>
        <div class="ann-head-actions">
          <button class="ann-link" @click="store.markAllNoticesRead()">全部已看</button>
          <button class="ann-close" @click="close">×</button>
        </div>
      </div>
      <div class="ann-list">
        <div v-if="!list.length" class="ann-empty">暂时没有公告</div>
        <div
          v-for="item in list"
          :key="item.id"
          class="ann-item"
          :class="{ unread: !store.readNoticeIds.includes(item.id) }"
          @click="onItemClick(item)"
        >
          <span v-if="!store.readNoticeIds.includes(item.id)" class="ann-dot"></span>
          <div class="ann-item-main">
            <div class="ann-item-top">
              <span class="ann-tag">{{ typeLabel(item.type) }}</span>
              <span v-if="item.is_top" class="ann-top-flag">置顶</span>
              <span class="ann-time">{{ formatTime(item.published_at || item.created_at) }}</span>
            </div>
            <div class="ann-title">{{ item.title }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <el-dialog v-model="detailVisible" title="公告详情" width="520px" align-center>
    <div v-if="detail" class="ann-detail">
      <div class="ann-detail-top">
        <span class="ann-tag">{{ typeLabel(detail.type) }}</span>
        <span v-if="detail.is_top" class="ann-top-flag">置顶</span>
        <span class="ann-time">{{ formatTime(detail.published_at || detail.created_at) }} · 浏览 {{ detail.view_count }}</span>
      </div>
      <h3 class="ann-detail-title">{{ detail.title }}</h3>
      <div class="markdown-body" v-html="renderMarkdown(detail.content || '')"></div>
      <p v-if="loadingDetail" class="ann-loading">正在加载最新内容…</p>
    </div>
    <div v-else class="ann-empty">暂无内容</div>
  </el-dialog>
</template>

<style scoped>
.ann-wrap { position: relative; display: inline-flex; }
.ann-bell { position: relative; width: 38px; height: 38px; border-radius: 10px; border: 1px solid var(--line, #e3e8e4); background: #f4faf7; color: var(--green, #0e7c6b); display: grid; place-items: center; cursor: pointer; transition: all .2s; }
.ann-bell:hover, .ann-bell.active { background: #e7f5ef; border-color: #cfe3da; }
.ann-badge { position: absolute; top: -6px; right: -6px; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; background: #e0a13c; color: #fff; font-size: 11px; font-style: normal; line-height: 18px; text-align: center; box-shadow: 0 0 0 2px #fff; }
.ann-mask { position: fixed; inset: 0; z-index: 40; }
.ann-panel { position: absolute; top: 46px; right: 0; width: 360px; max-height: 70vh; background: #fff; border: 1px solid #e3e8e4; border-radius: 14px; box-shadow: 0 18px 40px rgba(14,124,107,.18); display: flex; flex-direction: column; overflow: hidden; z-index: 50; }
.ann-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border-bottom: 1px solid #eef1ee; }
.ann-head-actions { display: flex; align-items: center; gap: 10px; }
.ann-link { background: none; border: none; color: var(--green, #0e7c6b); font-size: 12px; cursor: pointer; }
.ann-close { background: none; border: none; font-size: 18px; color: #9aa6a1; cursor: pointer; line-height: 1; }
.ann-list { overflow-y: auto; padding: 6px; }
.ann-empty { padding: 30px; text-align: center; color: #9aa6a1; font-size: 13px; }
.ann-item { display: flex; align-items: flex-start; gap: 8px; padding: 10px; border-radius: 10px; cursor: pointer; }
.ann-item:hover { background: #f4faf7; }
.ann-item.unread { background: #fdf7ec; }
.ann-dot { width: 8px; height: 8px; border-radius: 50%; background: #e0a13c; margin-top: 5px; flex: 0 0 auto; }
.ann-item-main { flex: 1; min-width: 0; }
.ann-item-top { display: flex; align-items: center; gap: 8px; margin-bottom: 3px; flex-wrap: wrap; }
.ann-tag { font-size: 11px; color: var(--green, #0e7c6b); background: #e7f5ef; padding: 1px 7px; border-radius: 6px; }
.ann-top-flag { font-size: 11px; color: #b07d2b; background: #fdf3e0; padding: 1px 7px; border-radius: 6px; }
.ann-time { font-size: 11px; color: #9aa6a1; }
.ann-title { font-size: 13px; color: #2f3a36; line-height: 1.5; word-break: break-word; }
.ann-detail-top { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; flex-wrap: wrap; }
.ann-detail-title { margin: 0 0 10px; font-size: 16px; color: #2f3a36; }
.ann-loading { margin: 10px 0 0; font-size: 12px; color: #a0aaa5; }
</style>
