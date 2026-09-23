<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAppStore, type ItemStatus, type ItemType } from '../stores/app'

const store = useAppStore()
const search = ref('')
const type = ref<'全部' | ItemType>('全部')
const status = ref<'全部' | ItemStatus>('全部')
const page = ref(1)
const pageSize = ref(6)
const editVisible = ref(false)
const editId = ref<number | null>(null)
const editForm = ref({ title: '', tags: [] as string[], location: '', desc: '' })
const tagOptions = ['数码', '证件', '日用', '服饰', '书籍', '其他']
const statusOptions: ItemStatus[] = ['招领中', '待认领', '已认领', '已关闭']
const filteredItems = computed(() => store.items.filter((item) => {
  const keyword = search.value.trim().toLowerCase()
  return (type.value === '全部' || item.type === type.value) && (status.value === '全部' || item.status === status.value) && item.title.toLowerCase().includes(keyword)
}))
const pagedItems = computed(() => filteredItems.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
watch([search, type, status], () => { page.value = 1 })

function openEdit(item: (typeof store.items)[number]) {
  editId.value = item.id
  editForm.value = { title: item.title, tags: [...item.tags], location: item.location, desc: item.desc }
  editVisible.value = true
}
function submitEdit() {
  if (!editId.value || !editForm.value.title.trim()) {
    ElMessage.warning('请填写物品名称')
    return
  }
  store.updateItem(editId.value, { ...editForm.value, title: editForm.value.title.trim() })
  editVisible.value = false
  ElMessage.success('修改成功')
}
async function togglePublished(item: (typeof store.items)[number]) {
  const action = item.status === '已关闭' ? '上架' : '下架'
  try {
    await ElMessageBox.confirm(`确定要${action}该物品吗？`, `${action}确认`, { type: 'warning', confirmButtonText: '确定', cancelButtonText: '取消' })
    store.toggleItemPublished(item.id)
    ElMessage.success(`已${action}`)
  } catch { /* 用户取消 */ }
}
async function removeItem(item: (typeof store.items)[number]) {
  try {
    await ElMessageBox.confirm(`确定要删除“${item.title}”吗？删除后无法恢复。`, '删除确认', { type: 'warning', confirmButtonText: '确定删除', cancelButtonText: '取消' })
    store.removeItem(item.id)
    ElMessage.success('删除成功')
  } catch { /* 用户取消 */ }
}
</script>

<template>
  <section class="manage-items page-section">
    <div class="section-intro"><span class="eyebrow">OPERATIONS</span><h1>物品管理</h1><p>维护校园内已发布的全部失物招领信息。</p></div>
    <div class="manage-toolbar"><el-input v-model="search" clearable placeholder="按物品名称搜索" class="manage-search"/><el-select v-model="type" placeholder="物品类型"><el-option label="全部类型" value="全部"/><el-option label="失物" value="lost"/><el-option label="招领" value="found"/></el-select><el-select v-model="status" placeholder="物品状态"><el-option label="全部状态" value="全部"/><el-option v-for="itemStatus in statusOptions" :key="itemStatus" :label="itemStatus" :value="itemStatus"/></el-select></div>
    <div class="manage-table-wrap"><el-table :data="pagedItems" stripe empty-text="暂无匹配物品"><el-table-column label="缩略图" width="78"><template #default="{ row }"><div class="manage-thumb" :class="row.color"><img v-if="row.images?.[0]" :src="row.images[0]" alt="物品缩略图"/><span v-else>{{ row.icon }}</span></div></template></el-table-column><el-table-column prop="title" label="物品名称" min-width="170"/><el-table-column label="物品标签" min-width="140"><template #default="{ row }"><div class="manage-tags"><el-tag v-for="tag in row.tags" :key="tag" size="small">{{ tag }}</el-tag></div></template></el-table-column><el-table-column prop="author" label="发布者" min-width="100"/><el-table-column prop="location" label="丢失/拾取地点" min-width="150"/><el-table-column label="当前状态" min-width="100"><template #default="{ row }"><el-tag :type="row.status === '已认领' ? 'success' : row.status === '已关闭' ? 'info' : row.status === '待认领' ? 'warning' : 'primary'">{{ row.status }}</el-tag></template></el-table-column><el-table-column prop="date" label="发布时间" min-width="100"/><el-table-column label="操作" fixed="right" width="220"><template #default="{ row }"><el-button type="primary" link @click="openEdit(row)">编辑</el-button><el-button type="warning" link @click="togglePublished(row)">{{ row.status === '已关闭' ? '上架' : '下架' }}</el-button><el-button type="danger" link @click="removeItem(row)">删除</el-button></template></el-table-column></el-table><div class="manage-pagination"><el-pagination v-model:current-page="page" v-model:page-size="pageSize" :page-sizes="[6, 12, 24]" :total="filteredItems.length" layout="total, sizes, prev, pager, next" background/></div></div>
    <el-dialog v-model="editVisible" title="编辑物品信息" width="min(520px, 92vw)"><el-form label-position="top"><el-form-item label="物品名称" required><el-input v-model="editForm.title" placeholder="请输入物品名称"/></el-form-item><el-form-item label="物品标签"><el-select v-model="editForm.tags" multiple class="manage-control" placeholder="请选择标签"><el-option v-for="tag in tagOptions" :key="tag" :label="tag" :value="tag"/></el-select></el-form-item><el-form-item label="地点"><el-input v-model="editForm.location"/></el-form-item><el-form-item label="描述"><el-input v-model="editForm.desc" type="textarea" :rows="4"/></el-form-item></el-form><template #footer><el-button @click="editVisible = false">取消</el-button><el-button type="primary" @click="submitEdit">提交修改</el-button></template></el-dialog>
  </section>
</template>
