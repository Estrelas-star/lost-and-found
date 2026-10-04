<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useAppStore, type Item, type ItemType } from '../stores/app'

const store = useAppStore()
const search = ref('')
const type = ref<'全部' | ItemType>('全部')
const page = ref(1)
const pageSize = ref(6)
const drawerVisible = ref(false)
const selectedItemId = ref<number | null>(null)
const rejectVisible = ref(false)
const rejectReason = ref('')

const activeItem = computed(() => store.items.find((item) => item.id === selectedItemId.value) ?? null)
const filteredItems = computed(() => store.items.filter((item) => {
  const text = `${item.title}${item.author}${item.location}${item.tags.join(' ')}`.toLowerCase()
  return item.status === '待审核' && (type.value === '全部' || item.type === type.value) && text.includes(search.value.trim().toLowerCase())
}))
const pagedItems = computed(() => filteredItems.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
watch([search, type], () => { page.value = 1 })

function openReview(item: Item) {
  selectedItemId.value = item.id
  drawerVisible.value = true
}

function closeDrawer() {
  drawerVisible.value = false
}

function clearDrawerSelection() {
  selectedItemId.value = null
}

function approve() {
  if (!activeItem.value || activeItem.value.status !== '待审核') return
  store.approve(activeItem.value.id)
  ElMessage.success('已通过该物品信息')
  closeDrawer()
}

function openRejectReason() {
  if (!activeItem.value || activeItem.value.status !== '待审核') return
  rejectReason.value = ''
  rejectVisible.value = true
}

function submitReject() {
  const reason = rejectReason.value.trim()
  if (!activeItem.value || !reason) {
    ElMessage.warning('请填写驳回原因')
    return
  }
  store.reject(activeItem.value.id, reason)
  rejectVisible.value = false
  ElMessage.success('已驳回该物品信息')
  closeDrawer()
}
</script>

<template>
  <section class="audit-center page-section">
    <div class="section-intro">
      <span class="eyebrow">OPERATIONS</span>
      <h1>审核中心</h1>
      <p>审核新提交的失物招领信息。</p>
    </div>

    <div class="audit-toolbar">
      <el-input v-model="search" clearable placeholder="搜索物品名称、发布者或地点" class="audit-search" />
      <el-select v-model="type" placeholder="按类型">
        <el-option label="全部类型" value="全部" />
        <el-option label="寻物" value="lost" />
        <el-option label="招领" value="found" />
      </el-select>
    </div>

    <div class="audit-table-wrap">
      <el-table :data="pagedItems" stripe empty-text="暂无待审核物品信息">
        <el-table-column label="图片" width="82">
          <template #default="{ row }"><div class="audit-thumb" :class="row.color"><img v-if="row.images?.[0]" :src="row.images[0]" alt="物品图片" /><span v-else>{{ row.icon }}</span></div></template>
        </el-table-column>
        <el-table-column prop="title" label="物品名称" min-width="170" />
        <el-table-column label="分类" min-width="130">
          <template #default="{ row }"><div class="audit-tags"><el-tag v-for="tag in row.tags" :key="tag" size="small">{{ tag }}</el-tag></div></template>
        </el-table-column>
        <el-table-column prop="author" label="发布者" min-width="100" />
        <el-table-column prop="date" label="发布时间" min-width="100" />
        <el-table-column label="当前状态" min-width="100">
          <template #default="{ row }"><el-tag type="warning">{{ row.status }}</el-tag></template>
        </el-table-column>
        <el-table-column label="操作" fixed="right" width="130">
          <template #default="{ row }"><el-button type="primary" link @click="openReview(row)">审核详情</el-button></template>
        </el-table-column>
      </el-table>
      <div class="audit-pagination">
        <el-pagination v-model:current-page="page" v-model:page-size="pageSize" :page-sizes="[6, 12, 24]" :total="filteredItems.length" layout="total, sizes, prev, pager, next" background />
      </div>
    </div>

    <el-drawer v-model="drawerVisible" class="audit-review-drawer" size="min(1000px, 96vw)" :with-header="false" destroy-on-close @closed="clearDrawerSelection">
      <div class="audit-drawer-shell">
        <header class="audit-drawer-header">
          <div><span class="eyebrow">ITEM REVIEW</span><h2>物品信息审核</h2></div>
          <button type="button" class="audit-drawer-close" aria-label="关闭审核详情" @click="closeDrawer">×</button>
        </header>
        <main v-if="activeItem" class="audit-drawer-body">
          <div class="audit-drawer-grid item-review-grid">
            <section class="audit-detail-column">
              <h3>物品信息</h3>
              <div class="audit-detail-gallery">
                <el-carousel v-if="activeItem.images?.length" height="min(400px, 48vh)" arrow="always" indicator-position="outside">
                  <el-carousel-item v-for="(image, index) in activeItem.images" :key="image"><el-image class="audit-detail-image" :src="image" :preview-src-list="activeItem.images" :initial-index="index" fit="contain" preview-teleported :alt="`${activeItem.title}图片`" /></el-carousel-item>
                </el-carousel>
                <div v-else class="audit-detail-placeholder" :class="activeItem.color"><span>{{ activeItem.icon }}</span><small>暂无物品图片</small></div>
              </div>
              <dl class="audit-detail-list">
                <div><dt>物品名称</dt><dd>{{ activeItem.title }}</dd></div>
                <div><dt>发布者</dt><dd>{{ activeItem.author }}</dd></div>
                <div><dt>详细地点</dt><dd>{{ activeItem.location }}</dd></div>
                <div><dt>发布时间</dt><dd>{{ activeItem.date }}</dd></div>
              </dl>
            </section>
            <section class="audit-detail-column">
              <h3>发布内容</h3>
              <dl class="audit-detail-list">
                <div><dt>发布者完整描述</dt><dd class="audit-long-text">{{ activeItem.desc }}</dd></div>
                <div><dt>物品类型</dt><dd>{{ activeItem.type === 'lost' ? '寻物' : '招领' }}</dd></div>
                <div><dt>物品标签</dt><dd><el-tag v-for="tag in activeItem.tags" :key="tag" size="small">{{ tag }}</el-tag></dd></div>
                <div><dt>发布者联系方式</dt><dd>{{ activeItem.contact || '未提供' }}</dd></div>
                <div v-if="activeItem.reviewReason"><dt>驳回原因</dt><dd class="audit-rejection-reason">{{ activeItem.reviewReason }}</dd></div>
              </dl>
            </section>
          </div>
        </main>
        <footer class="audit-drawer-footer">
          <div class="audit-drawer-result"><el-tag :type="activeItem?.status === '待审核' ? 'warning' : 'success'">{{ activeItem?.status }}</el-tag><span v-if="activeItem?.status !== '待审核'">审核已完成，操作已锁定</span></div>
          <div class="audit-drawer-actions">
            <el-button type="danger" plain :disabled="activeItem?.status !== '待审核'" @click="openRejectReason">驳回</el-button>
            <el-button type="success" :disabled="activeItem?.status !== '待审核'" @click="approve">通过</el-button>
          </div>
        </footer>
      </div>
    </el-drawer>

    <el-dialog v-model="rejectVisible" title="填写驳回原因" width="min(460px, 92vw)" append-to-body>
      <p class="audit-reject-prompt">驳回原因会显示给发布者。</p>
      <el-input v-model="rejectReason" type="textarea" :rows="5" maxlength="300" show-word-limit placeholder="请清楚说明驳回原因" />
      <template #footer><el-button @click="rejectVisible = false">取消</el-button><el-button type="danger" @click="submitReject">确认驳回</el-button></template>
    </el-dialog>
  </section>
</template>