<script setup lang="ts">
// 商品管理（失物招领管理员 role≥1）：列表 / 新增 / 编辑 / 下架
// 契约：POST /shop/goods/create | update | delete（api_guide.md §八、api_agent.md §2.8）
//
// ⚠️ 后端现状（已核对 shop_agent.md §一 与接口清单）：
//   goods 表只有 is_deleted（软删）没有 status 字段，且管理员侧只开放了 create/update/delete 三个接口，
//   没有「含已下架商品」的管理端列表接口。因此本页列表复用公开接口 GET /shop/goods/list，
//   只能看到未下架商品 —— 下架后前端无法恢复（已在界面上用 el-alert 明确告知管理员）。
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { createGood, deleteGood, listGoods, updateGood } from '../api/shop'
import type { GoodDTO } from '../api/shop'
import { uploadImage } from '../api/upload'
import { resolveImageUrl } from '../utils/image'
import ImageDropzone from './ImageDropzone.vue'

const list = ref<GoodDTO[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
const keyword = ref('')
const loading = ref(false)
const busyId = ref<number | null>(null)

async function load() {
  loading.value = true
  try {
    const res = await listGoods({
      keyword: keyword.value.trim() || undefined,
      page: page.value,
      page_size: pageSize.value,
    })
    list.value = res.data?.items ?? []
    total.value = res.data?.total ?? 0
  } catch (e) {
    list.value = []
    total.value = 0
    ElMessage.error((e as Error).message || '商品列表加载失败')
  } finally {
    loading.value = false
  }
}
let searchTimer: ReturnType<typeof setTimeout> | null = null
watch(keyword, () => {
  page.value = 1
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(load, 300)
})
function onPage(p: number) { page.value = p; load() }
function onPageSize(s: number) { pageSize.value = s; page.value = 1; load() }

// —— 新增 / 编辑对话框 ——
const dialog = ref(false)
const editingId = ref<number | null>(null)
const submitting = ref(false)
const uploading = ref(false)
const form = ref({ name: '', description: '', image_url: '', price: 100, stock: 0, sort_order: 0 })
const dialogTitle = computed(() => (editingId.value == null ? '新增商品' : '编辑商品'))

function openCreate() {
  editingId.value = null
  form.value = { name: '', description: '', image_url: '', price: 100, stock: 0, sort_order: 0 }
  dialog.value = true
}
// 移除已上传的图片（保存时该字段会被整个省略，避免后端对空 image_url 报 1）
function clearImage() { form.value.image_url = '' }
function openEdit(g: GoodDTO) {
  editingId.value = g.id
  form.value = {
    name: g.name,
    description: g.description ?? '',
    image_url: g.image_url ?? '',
    price: g.price,
    stock: g.stock,
    sort_order: g.sort_order ?? 0,
  }
  dialog.value = true
}

// 图片上传：复用 POST /upload/image（返回相对 URL），与物品发布的图片链路一致
// ImageDropzone 已完成「类型 / 大小」预检；单图模式下多选会被截断为 1 张
async function onPickImageFiles(files: File[]) {
  const file = files[0]
  if (!file) return
  uploading.value = true
  try {
    form.value.image_url = await uploadImage(file)
    ElMessage.success('图片已上传')
  } catch (err) {
    ElMessage.error((err as Error).message || '图片上传失败')
  } finally {
    uploading.value = false
  }
}

async function submit() {
  const name = form.value.name.trim()
  if (!name) { ElMessage.warning('请填写商品名称'); return }
  if (name.length > 100) { ElMessage.warning('商品名称不能超过 100 个字符'); return }
  const price = Number(form.value.price)
  if (!Number.isFinite(price) || price < 1 || price > 1000000) { ElMessage.warning('所需积分需在 1 ~ 1000000 之间'); return }
  const stock = Number(form.value.stock)
  if (!Number.isFinite(stock) || stock < 0) { ElMessage.warning('库存不能为负数'); return }
  if ((form.value.image_url || '').length > 500) { ElMessage.warning('图片地址过长（≤500 字符）'); return }

  submitting.value = true
  try {
    // image_url 为空时整个字段省略（后端对「空 image_url」会返回 1 参数错误）
    const base = {
      name,
      description: form.value.description.trim(),
      price,
      stock,
      sort_order: Number(form.value.sort_order) || 0,
      ...(form.value.image_url ? { image_url: form.value.image_url } : {}),
    }
    if (editingId.value == null) {
      await createGood(base)
      ElMessage.success('商品已创建')
    } else {
      await updateGood({ id: editingId.value, ...base })
      ElMessage.success('商品已更新')
    }
    dialog.value = false
    await load()
  } catch (e) {
    ElMessage.error((e as Error).message || '保存失败，请稍后重试')
  } finally {
    submitting.value = false
  }
}

// —— 下架（软删，不可逆）——
async function remove(g: GoodDTO) {
  try {
    await ElMessageBox.confirm(
      `确认下架「${g.name}」？下架后该商品将从商城移除，历史订单不受影响（前端无法恢复）。`,
      '下架确认',
      { type: 'warning', confirmButtonText: '确认下架', cancelButtonText: '取消' }
    )
  } catch { return }
  busyId.value = g.id
  try {
    await deleteGood(g.id)
    ElMessage.success('已下架')
    if (list.value.length === 1 && page.value > 1) page.value -= 1
    await load()
  } catch (e) {
    ElMessage.error((e as Error).message || '下架失败，请稍后重试')
  } finally {
    busyId.value = null
  }
}

onMounted(load)
</script>

<template>
  <section class="goods-page">
    <div class="section-intro">
      <span class="eyebrow">STORE OPERATIONS</span>
      <h1>商品管理</h1>
      <p>维护积分商城的可兑换商品：新增、编辑积分与库存、下架。</p>
    </div>

    <div class="goods-toolbar">
      <el-input v-model="keyword" clearable placeholder="搜索商品名称" class="goods-search" />
      <el-button type="primary" @click="openCreate">＋ 新增商品</el-button>
    </div>

    <el-alert
      type="info"
      :closable="false"
      show-icon
      class="goods-alert"
      title="商品只有「在架 / 下架」两种状态，没有草稿态；且未开放含已下架商品的管理端列表，因此本页只显示未下架商品，下架后无法在前端恢复。兑换记录为快照，不受下架影响。"
    />

    <div class="goods-table-wrap">
      <el-table :data="list" v-loading="loading" stripe empty-text="暂无商品，点右上角「新增商品」开始配置">
        <el-table-column label="图片" width="86">
          <template #default="{ row }">
            <div class="goods-thumb">
              <img v-if="row.image_url" :src="resolveImageUrl(row.image_url)" alt="" />
              <span v-else>◆</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="name" label="商品名称" min-width="150" />
        <el-table-column label="描述" min-width="200">
          <template #default="{ row }"><span class="goods-desc">{{ row.description || '—' }}</span></template>
        </el-table-column>
        <el-table-column label="所需积分" width="100">
          <template #default="{ row }"><strong class="goods-price">{{ row.price }}</strong></template>
        </el-table-column>
        <el-table-column label="库存" width="90">
          <template #default="{ row }">
            <el-tag :type="row.stock > 0 ? 'success' : 'info'" size="small">{{ row.stock }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="sort_order" label="排序" width="80" />
        <el-table-column label="创建时间" width="120">
          <template #default="{ row }">{{ (row.created_at || '').slice(0, 10) }}</template>
        </el-table-column>
        <el-table-column label="操作" fixed="right" width="150">
          <template #default="{ row }">
            <el-button type="primary" link @click="openEdit(row)">编辑</el-button>
            <el-button type="danger" link :loading="busyId === row.id" @click="remove(row)">下架</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <div v-if="total > pageSize" class="goods-pagination">
      <el-pagination
        :current-page="page"
        :page-size="pageSize"
        :page-sizes="[10, 20, 50]"
        :total="total"
        layout="total, sizes, prev, pager, next"
        background
        @current-change="onPage"
        @size-change="onPageSize"
      />
    </div>

    <el-dialog v-model="dialog" :title="dialogTitle" width="min(560px, 94vw)" align-center>
      <el-form label-position="top" class="goods-form">
        <el-form-item label="商品名称" required>
          <el-input v-model="form.name" maxlength="100" show-word-limit placeholder="例如：校园卡挂绳" />
        </el-form-item>
        <el-form-item label="商品描述">
          <el-input v-model="form.description" type="textarea" :rows="3" maxlength="300" show-word-limit placeholder="规格、领取方式等（可选）" />
        </el-form-item>
        <el-form-item label="商品图片">
          <ImageDropzone mode="single" :previews="form.image_url ? [form.image_url] : []" :loading="uploading" label="拖拽商品图片到此处，或点击选择" hint="支持 JPG / PNG / WEBP，单张 ≤5MB；建议使用正方形图片" @files="onPickImageFiles" @remove="clearImage" />
        </el-form-item>
        <el-row :gutter="16">
          <el-col :xs="24" :sm="8">
            <el-form-item label="所需积分" required>
              <el-input-number v-model="form.price" :min="1" :max="1000000" :step="10" controls-position="right" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="8">
            <el-form-item label="库存">
              <el-input-number v-model="form.stock" :min="0" :max="999999" controls-position="right" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="8">
            <el-form-item label="排序号">
              <el-input-number v-model="form.sort_order" :min="0" :max="999999" controls-position="right" style="width:100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <p class="goods-form-tip">库存为 0 时商品仍会展示，但学生端不可兑换；排序号越小越靠前。</p>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submit">保存</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<style scoped>
.goods-page{max-width:var(--page-max)}
.goods-toolbar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:22px 0 14px}
.goods-search{width:260px}
.goods-alert{margin-bottom:16px}
.goods-table-wrap{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-lg);overflow:hidden;box-shadow:var(--shadow-xs)}
.goods-table-wrap :deep(.el-table){--el-table-header-bg-color:#f7faf7;--el-table-border-color:#edf1ed;--el-table-row-hover-bg-color:#f5faf7}
.goods-thumb{width:44px;height:44px;display:grid;place-items:center;overflow:hidden;border-radius:8px;background:#edf5ee;color:#b6cdc2;font-size:18px}
.goods-thumb img{width:100%;height:100%;object-fit:cover}
.goods-desc{display:inline-block;max-width:320px;color:var(--muted);font-size:12px;line-height:1.5;vertical-align:middle}
.goods-price{color:var(--green);font-size:14px}
.goods-pagination{display:flex;justify-content:center;padding:20px 0 4px}
.goods-form{max-width:100%}
.goods-form-tip{margin:0;color:var(--muted);font-size:12px;line-height:1.6}
@media(max-width:700px){
  .goods-search{width:100%}
  .goods-table-wrap{overflow-x:auto}
}
</style>
