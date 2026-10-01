<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue'
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
const filteredItems = computed(() => pendingItems.value.filter((item) => {
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

// —— 举报审核 tab ——
const activeTab = ref<'posts' | 'reports'>('posts')
const reportStatus = ref<number | ''>('')
const reviewVisible = ref(false)
const reviewTarget = ref<(typeof store.reports)[number] | null>(null)
const reviewAction = ref<1 | 2 | 3>(1)
const auditComment = ref('')
const reasonLabels: Record<number, string> = { 0: '虚假信息', 1: '违规内容', 2: '恶意行为', 3: '其他' }
const reportStatusLabels: Record<number, string> = { 0: '待审核', 1: '已通过', 2: '已驳回', 3: '已处理' }
const filteredReports = computed(() =>
  store.reports.filter((r) => reportStatus.value === '' || r.status === reportStatus.value)
)
function reasonLabel(r: number) { return reasonLabels[r] ?? '其他' }
function reportStatusLabel(s: number) { return reportStatusLabels[s] ?? String(s) }
function reportStatusType(s: number): 'warning' | 'success' | 'danger' | 'info' {
  return s === 0 ? 'warning' : s === 1 ? 'success' : s === 2 ? 'danger' : 'info'
}
function openReview(row: (typeof store.reports)[number], action: 1 | 2 | 3) {
  reviewTarget.value = row
  reviewAction.value = action
  auditComment.value = ''
  reviewVisible.value = true
}
async function submitReview() {
  if (!reviewTarget.value) return
  try {
    await store.reviewReport(reviewTarget.value.id, { status: reviewAction.value, audit_comment: auditComment.value.trim() || undefined })
    ElMessage.success(reviewAction.value === 1 ? '已通过' : reviewAction.value === 2 ? '已驳回' : '已标记处理')
  } catch {
    ElMessage.error('操作失败，请重试')
  } finally {
    reviewVisible.value = false
  }
}
onMounted(() => { store.fetchReports({ target_type: 0 }) })
</script>

<template>
  <section class="audit-center page-section">
    <div class="section-intro"><span class="eyebrow">OPERATIONS</span><h1>审核中心</h1><p>集中处理新提交的失物招领信息与用户举报。</p></div>

    <el-tabs v-model="activeTab">
      <el-tab-pane label="帖子审核" name="posts">
        <div class="audit-toolbar"><el-input v-model="search" clearable placeholder="搜索物品名称、发布者或地点" class="audit-search"/><el-select v-model="status" placeholder="按状态"><el-option label="全部状态" value="全部"/><el-option label="待审核" value="待审核"/></el-select><el-select v-model="type" placeholder="按类型"><el-option label="全部类型" value="全部"/><el-option label="寻物" value="lost"/><el-option label="招领" value="found"/></el-select></div>
        <div class="audit-table-wrap"><el-table :data="pagedItems" stripe empty-text="暂无待审核信息"><el-table-column label="图片" width="82"><template #default="{ row }"><div class="audit-thumb" :class="row.color"><img v-if="row.images?.[0]" :src="row.images[0]" alt="物品图片"/><span v-else>{{ row.icon }}</span></div></template></el-table-column><el-table-column prop="title" label="物品名称" min-width="170"/><el-table-column label="分类" min-width="130"><template #default="{ row }"><div class="audit-tags"><el-tag v-for="tag in row.tags" :key="tag" size="small">{{ tag }}</el-tag></div></template></el-table-column><el-table-column prop="author" label="发布者" min-width="100"/><el-table-column prop="date" label="发布时间" min-width="100"/><el-table-column label="当前状态" min-width="100"><template #default="{ row }"><el-tag type="warning">{{ row.status }}</el-tag></template></el-table-column><el-table-column label="操作" fixed="right" width="150"><template #default="{ row }"><el-button type="success" link @click="approve(row.id)">通过</el-button><el-button type="danger" link @click="openReject(row.id)">驳回</el-button></template></el-table-column></el-table><div class="audit-pagination"><el-pagination v-model:current-page="page" v-model:page-size="pageSize" :page-sizes="[6, 12, 24]" :total="filteredItems.length" layout="total, sizes, prev, pager, next" background/></div></div>
      </el-tab-pane>

      <el-tab-pane label="举报审核" name="reports">
        <div class="audit-toolbar"><el-select v-model="reportStatus" placeholder="举报状态" style="width:170px"><el-option label="待审核" :value="0"/><el-option label="已通过" :value="1"/><el-option label="已驳回" :value="2"/><el-option label="已处理" :value="3"/><el-option label="全部" :value="''"/></el-select></div>
        <div class="audit-table-wrap"><el-table :data="filteredReports" stripe empty-text="暂无举报"><el-table-column label="被举报帖子" min-width="160"><template #default="{ row }">{{ row.item?.title || ('帖子 #' + row.target_id) }}</template></el-table-column><el-table-column label="举报人" prop="reporter_id" width="100"/><el-table-column label="原因" width="110"><template #default="{ row }"><el-tag>{{ reasonLabel(row.reason) }}</el-tag></template></el-table-column><el-table-column label="描述" prop="description" min-width="160"/><el-table-column label="状态" width="100"><template #default="{ row }"><el-tag :type="reportStatusType(row.status)">{{ reportStatusLabel(row.status) }}</el-tag></template></el-table-column><el-table-column label="操作" fixed="right" width="200"><template #default="{ row }"><template v-if="row.status === 0"><el-button type="success" link @click="openReview(row, 1)">通过</el-button><el-button type="danger" link @click="openReview(row, 2)">驳回</el-button><el-button type="warning" link @click="openReview(row, 3)">已处理</el-button></template><span v-else>已审核</span></template></el-table-column></el-table></div>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="rejectVisible" title="填写驳回原因" width="min(420px, 92vw)"><el-input v-model="rejectReason" type="textarea" :rows="4" maxlength="200" show-word-limit placeholder="请说明驳回原因"/><template #footer><el-button @click="rejectVisible = false">取消</el-button><el-button type="danger" @click="reject">确认驳回</el-button></template></el-dialog>

    <el-dialog v-model="reviewVisible" title="审核举报" width="min(460px, 92vw)">
      <div v-if="reviewTarget" class="review-box">
        <p><b>被举报帖子：</b>{{ reviewTarget.item?.title || ('帖子 #' + reviewTarget.target_id) }}</p>
        <p><b>举报原因：</b>{{ reasonLabel(reviewTarget.reason) }}</p>
        <p><b>举报描述：</b>{{ reviewTarget.description || '（无）' }}</p>
        <p><b>处理动作：</b>{{ reviewAction === 1 ? '通过' : reviewAction === 2 ? '驳回' : '已处理' }}</p>
        <el-input v-model="auditComment" type="textarea" :rows="3" maxlength="200" show-word-limit placeholder="审核意见（可选）"/>
      </div>
      <template #footer><el-button @click="reviewVisible = false">取消</el-button><el-button type="primary" @click="submitReview">提交审核</el-button></template>
    </el-dialog>
  </section>
</template>
