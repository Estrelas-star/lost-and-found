<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAppStore, type Item, type ItemStatus, type ItemType } from '../stores/app'
import { ApiError } from '../api/http'

const store = useAppStore()
const search = ref('')
const type = ref<'全部' | ItemType>('全部')
const status = ref<'全部' | ItemStatus>('全部')
const page = ref(1)
const pageSize = ref(6)
const editVisible = ref(false)
const editId = ref<number | null>(null)
const editForm = ref({ title: '', tags: [] as string[], location: '', desc: '' })

// 后端状态只有 0在架/1已认领/2已关闭，没有"待认领"；
// 在架再按物品类型分成「寻找中(lost)／招领中(found)」两种展示，筛选时二者都查后端 status=0
const statusOptions: ItemStatus[] = ['寻找中', '招领中', '已认领', '已关闭']

// 真实后端帖子（审核员视角）：只展示服务端数据，**不做本地演示数据兜底**（避免筛选出无关内容）
const allRemote = computed(() => store.remoteItems)
const filteredItems = computed(() => allRemote.value.filter((item) => {
  const keyword = search.value.trim().toLowerCase()
  return (type.value === '全部' || item.type === type.value)
    && (status.value === '全部' || item.status === status.value)
    && item.title.toLowerCase().includes(keyword)
}))
const pagedItems = computed(() => filteredItems.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
watch([search, type, status], () => { page.value = 1 })

// 进入页面 + 切换状态/类型时拉真实数据（status 映射到后端数值）
watch([status, type], () => {
  const params: Record<string, number> = {}
  if (status.value !== '全部') params.status = status.value === '已关闭' ? 2 : status.value === '已认领' ? 1 : 0
  if (type.value !== '全部') params.type = type.value === 'lost' ? 0 : 1
  store.fetchItems(params)
}, { immediate: true })

function statusType(s: ItemStatus): 'primary' | 'warning' | 'success' | 'info' {
  return s === '已认领' ? 'success' : s === '已关闭' ? 'info' : s === '待认领' ? 'warning' : 'primary'
}

function friendlyError(e: unknown, fallback: string): string {
  const msg = (e as Error)?.message || fallback
  if (/无权利|无权限|permission|forbidden|not authorized|403/i.test(msg)) {
    return '管理员暂无权操作该物品：后端尚未开放管理员改/删/下架他人物品的权限'
  }
  return msg
}

function openEdit(item: Item) {
  editId.value = item.id
  editForm.value = { title: item.title, tags: [...item.tags], location: item.location, desc: item.desc }
  editVisible.value = true
}
// —— 强制撤回认领（POST /admin/item/:id/reset，role≥1）——
// 仅「已认领」显示按钮；成功后后端把 status 1→0 并清空认领信息，
// 前端一律按服务端最新数据刷新（20001/20002/20011 也要刷新），绝不本地改 status
const resettingId = ref<number | null>(null)
async function resetClaim(item: Item) {
  if (resettingId.value) return   // 请求期间禁用，防重复点击
  try {
    await ElMessageBox.confirm(
      `确定撤回「${item.title}」的认领吗？撤回后物品恢复为已发布，双方都会收到通知且认领记录不可恢复。`,
      '强制撤回认领',
      { type: 'warning', confirmButtonText: '确定撤回', cancelButtonText: '取消' }
    )
  } catch { return }
  resettingId.value = item.id
  try {
    await store.resetItemClaim(item.id)
    ElMessage.success('已撤回该认领，物品已恢复为已发布')
  } catch (e) {
    const code = e instanceof ApiError ? e.code : 0
    if (code === 20001 || code === 20002 || code === 20011) {
      // 服务端状态已变：提示后按服务端最新数据刷新
      ElMessage.warning((e as Error).message || '物品状态已变化，已为你刷新')
      await store.fetchItems()
    } else if (code === 6) {
      ElMessage.error('服务器开小差了，请稍后重试')
    } else {
      ElMessage.error((e as Error).message || '撤回失败，请稍后重试')
    }
  } finally {
    resettingId.value = null
  }
}
function submitEdit() {
  if (!editId.value || !editForm.value.title.trim()) {
    ElMessage.warning('请填写物品名称')
    return
  }
  const tagIds = editForm.value.tags.map((name) => store.tagIdByName[name]).filter((id): id is number => id != null)
  store.saveRemoteItem(editId.value, {
    title: editForm.value.title.trim(),
    description: editForm.value.desc,
    location_detail: editForm.value.location,
    tag_ids: tagIds,
  }).then(() => {
    editVisible.value = false
    ElMessage.success('修改成功')
  }).catch((e) => ElMessage.error(friendlyError(e, '修改失败')))
}
async function closeItem(item: Item) {
  try {
    await ElMessageBox.confirm(`确定要下架“${item.title}”吗？下架后其他人将看不到该物品。`, '下架确认', { type: 'warning', confirmButtonText: '确定下架', cancelButtonText: '取消' })
  } catch { return }
  try {
    await store.closeRemoteItem(item.id)
    ElMessage.success('已下架')
  } catch (e) {
    ElMessage.error(friendlyError(e, '下架失败'))
  }
}
async function removeItem(item: Item) {
  try {
    await ElMessageBox.confirm(`确定要删除“${item.title}”吗？删除后无法恢复。`, '删除确认', { type: 'warning', confirmButtonText: '确定删除', cancelButtonText: '取消' })
  } catch { return }
  try {
    await store.removeRemoteItem(item.id)
    ElMessage.success('删除成功')
  } catch (e) {
    ElMessage.error(friendlyError(e, '删除失败'))
  }
}
</script>

<template>
  <section class="manage-items page-section">
    <div class="section-intro"><span class="eyebrow">OPERATIONS</span><h1>物品管理</h1><p>维护校园内已发布的全部失物招领信息（实时来自后端）。</p></div>
    <div class="manage-toolbar"><el-input v-model="search" clearable placeholder="按物品名称搜索" class="manage-search"/><el-select v-model="type" placeholder="物品类型"><el-option label="全部类型" value="全部"/><el-option label="失物" value="lost"/><el-option label="招领" value="found"/></el-select><el-select v-model="status" placeholder="物品状态"><el-option label="全部状态" value="全部"/><el-option v-for="itemStatus in statusOptions" :key="itemStatus" :label="itemStatus" :value="itemStatus"/></el-select></div>
    <div class="manage-table-wrap"><el-table :data="pagedItems" stripe empty-text="暂无物品"><el-table-column label="缩略图" width="78"><template #default="{ row }"><div class="manage-thumb" :class="row.color"><img v-if="row.images?.[0]" :src="row.images[0]" alt="物品缩略图"/><span v-else>{{ row.icon }}</span></div></template></el-table-column><el-table-column prop="title" label="物品名称" min-width="170"/><el-table-column label="物品标签" min-width="140"><template #default="{ row }"><div class="manage-tags"><el-tag v-for="tag in row.tags" :key="tag" size="small">{{ tag }}</el-tag></div></template></el-table-column><el-table-column prop="author" label="发布者" min-width="100"/><el-table-column prop="location" label="丢失/拾取地点" min-width="150"/><el-table-column label="当前状态" min-width="100"><template #default="{ row }"><el-tag :type="statusType(row.status)">{{ row.status }}</el-tag></template></el-table-column><el-table-column prop="date" label="发布时间" min-width="100"/><el-table-column label="操作" fixed="right" width="300"><template #default="{ row }"><el-button type="primary" link @click="openEdit(row)">编辑</el-button><el-button v-if="row.status !== '已关闭'" type="warning" link @click="closeItem(row)">下架</el-button><el-button v-if="row.status === '已认领'" type="primary" link :loading="resettingId === row.id" :disabled="!!resettingId" @click="resetClaim(row)">撤回认领</el-button><el-button type="danger" link @click="removeItem(row)">删除</el-button></template></el-table-column></el-table><div class="manage-pagination"><el-pagination v-model:current-page="page" v-model:page-size="pageSize" :page-sizes="[6, 12, 24]" :total="filteredItems.length" layout="total, sizes, prev, pager, next" background/></div></div>
    <el-dialog v-model="editVisible" title="编辑物品信息" width="min(520px, 92vw)"><el-form label-position="top"><el-form-item label="物品名称" required><el-input v-model="editForm.title" placeholder="请输入物品名称"/></el-form-item><el-form-item label="物品标签"><el-select v-model="editForm.tags" multiple class="manage-control" placeholder="请选择标签"><el-option v-for="tag in store.tags" :key="tag.id" :label="tag.name" :value="tag.name"/></el-select></el-form-item><el-form-item label="地点"><el-input v-model="editForm.location" placeholder="丢失/拾取地点"/></el-form-item><el-form-item label="描述"><el-input v-model="editForm.desc" type="textarea" :rows="4"/></el-form-item></el-form><template #footer><el-button @click="editVisible = false">取消</el-button><el-button type="primary" @click="submitEdit">提交修改</el-button></template></el-dialog>
  </section>
</template>
