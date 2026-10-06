<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useAppStore, type ItemType } from '../stores/app'

const store = useAppStore()
const search = ref('')
const status = ref<'全部' | '待审核'>('全部')
const type = ref<'全部' | ItemType>('全部')
const page = ref(1)
const pageSize = ref(6)
const rejectVisible = ref(false)
const rejectReason = ref('')
const rejectingId = ref<number | null>(null)
const pendingItems = computed(() => store.items.filter((item) => item.status === '待审核'))
// 后端当前没有“待审核”状态(只有 0已发布/1已认领/2已关闭)，帖子审核 tab 用演示数据兜底
const usingPostFallback = computed(() => pendingItems.value.length === 0)
const demoPending = computed(() => store.items.map((it) => ({ ...it, status: '待审核' as const })))
const effectivePending = computed(() => pendingItems.value.length ? pendingItems.value : demoPending.value)
const filteredItems = computed(() => effectivePending.value.filter((item) => {
  const text = `${item.title}${item.author}${item.location}${item.tags.join(' ')}`.toLowerCase()
  return (status.value === '全部' || item.status === status.value) && (type.value === '全部' || item.type === type.value) && text.includes(search.value.trim().toLowerCase())
}))
const pagedItems = computed(() => filteredItems.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
watch([search, status, type], () => { page.value = 1 })

function approve(id: number) {
  store.approve(id)
  ElMessage.success('已通过审核')
}
function openReject(id: number) {
  rejectingId.value = id
  rejectReason.value = ''
  rejectVisible.value = true
}
function reject() {
  if (!rejectingId.value || !rejectReason.value.trim()) {
    ElMessage.warning('请填写驳回原因')
    return
  }
  store.reject(rejectingId.value, rejectReason.value.trim())
  rejectVisible.value = false
  ElMessage.success('已驳回该信息')
}

// 注：举报模块后端未实现（仅建表 + 70001-70004 错误码占位，无路由），故审核中心只保留「帖子审核」。
</script>

<template>
  <section class="audit-center page-section">
    <div class="section-intro"><span class="eyebrow">OPERATIONS</span><h1>审核中心</h1><p>集中处理新提交的失物招领信息。</p></div>

    <el-alert v-if="usingPostFallback" type="warning" show-icon :closable="false" style="margin-bottom:16px"
      title="后端暂无待审核数据"
      description="后端当前未提供“待审核”状态的帖子，下方为演示数据。真实待审核信息接入后将自动替换。" />
    <div class="audit-toolbar"><el-input v-model="search" clearable placeholder="搜索物品名称、发布者或地点" class="audit-search"/><el-select v-model="status" placeholder="按状态"><el-option label="全部状态" value="全部"/><el-option label="待审核" value="待审核"/></el-select><el-select v-model="type" placeholder="按类型"><el-option label="全部类型" value="全部"/><el-option label="寻物" value="lost"/><el-option label="招领" value="found"/></el-select></div>
    <div class="audit-table-wrap"><el-table :data="pagedItems" stripe empty-text="暂无待审核信息"><el-table-column label="图片" width="82"><template #default="{ row }"><div class="audit-thumb" :class="row.color"><img v-if="row.images?.[0]" :src="row.images[0]" alt="物品图片"/><span v-else>{{ row.icon }}</span></div></template></el-table-column><el-table-column prop="title" label="物品名称" min-width="170"/><el-table-column label="分类" min-width="130"><template #default="{ row }"><div class="audit-tags"><el-tag v-for="tag in row.tags" :key="tag" size="small">{{ tag }}</el-tag></div></template></el-table-column><el-table-column prop="author" label="发布者" min-width="100"/><el-table-column prop="date" label="发布时间" min-width="100"/><el-table-column label="当前状态" min-width="100"><template #default="{ row }"><el-tag type="warning">{{ row.status }}</el-tag></template></el-table-column><el-table-column label="操作" fixed="right" width="150"><template #default="{ row }"><el-button type="success" link @click="approve(row.id)">通过</el-button><el-button type="danger" link @click="openReject(row.id)">驳回</el-button></template></el-table-column></el-table><div class="audit-pagination"><el-pagination v-model:current-page="page" v-model:page-size="pageSize" :page-sizes="[6, 12, 24]" :total="filteredItems.length" layout="total, sizes, prev, pager, next" background/></div></div>

    <el-dialog v-model="rejectVisible" title="填写驳回原因" width="min(420px, 92vw)"><el-input v-model="rejectReason" type="textarea" :rows="4" maxlength="200" show-word-limit placeholder="请说明驳回原因"/><template #footer><el-button @click="rejectVisible = false">取消</el-button><el-button type="danger" @click="reject">确认驳回</el-button></template></el-dialog>

  </section>
</template>
