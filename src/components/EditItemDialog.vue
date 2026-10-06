<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useAppStore, type Item } from '../stores/app'
import { setItemImages } from '../api/item'
import { uploadImage } from '../api/upload'
import { ElMessage } from 'element-plus'
import ImageDropzone from './ImageDropzone.vue'
const descRef = ref<any>(null)
const descDragOver = ref(false)
function insertDescAtCursor(snippet: string) {
  const ta = descRef.value?.textarea as HTMLTextAreaElement | undefined
  const pos = ta ? ta.selectionStart : description.value.length
  const cur = description.value
  description.value = cur.slice(0, pos) + snippet + cur.slice(pos)
}
async function onDescDrop(e: DragEvent) {
  e.preventDefault()
  descDragOver.value = false
  const files = Array.from(e.dataTransfer?.files || []).filter((f) => f.type.startsWith('image/'))
  for (const f of files) {
    try {
      const url = await uploadImage(f)
      insertDescAtCursor(`\n![图片](${url})\n`)
      ElMessage.success('图片已插入描述')
    } catch {
      ElMessage.error('图片上传失败，请重试')
    }
  }
}

const props = defineProps<{ item: Item | null; visible: boolean }>()
const emit = defineEmits<{ close: []; saved: [] }>()
const store = useAppStore()

const title = ref('')
const description = ref('')
const typeLabel = ref('')
const selectedTags = ref<string[]>([])
const locPath = ref<number[]>([])
const locDetail = ref('')
const imageUrls = ref<string[]>([])   // 已存在的图片 URL
const pendingFiles = ref<File[]>([])  // 待上传的新图片

interface CascaderNode { value: number; label: string; children: CascaderNode[] }
function buildLocTree(list: { id: number; name: string; parent_id: number }[]): CascaderNode[] {
  const map = new Map<number, CascaderNode>()
  list.forEach((l) => map.set(l.id, { value: l.id, label: l.name, children: [] }))
  const roots: CascaderNode[] = []
  list.forEach((l) => {
    const node = map.get(l.id)!
    const parent = l.parent_id != null && l.parent_id !== 0 ? map.get(l.parent_id) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  })
  return roots
}
const locationOptions = computed(() => buildLocTree(store.locations))

// 由叶子 location_id 反推完整路径，用于预填级联选择器（后端地点链从根到叶）
function pathFromId(id: number | undefined): number[] {
  if (id == null) return []
  const byId = new Map(store.locations.map((l) => [l.id, l]))
  const path: number[] = []
  let cur = byId.get(id)
  while (cur) {
    path.unshift(cur.id)
    cur = cur.parent_id != null && cur.parent_id !== 0 ? byId.get(cur.parent_id) : undefined
  }
  return path
}

// 打开弹窗时把当前物品内容预填进表单（只认后端真实存在的标签名）
watch(
  () => [props.visible, props.item],
  () => {
    const it = props.item
    if (!props.visible || !it) return
    title.value = it.title
    description.value = it.desc || ''
    typeLabel.value = it.type === 'lost' ? '寻物' : '招领'
    selectedTags.value = it.tags.filter((t) => store.tagIdByName[t] != null)
    locPath.value = pathFromId(it.locationId)
    locDetail.value = it.locationDetail || ''
    imageUrls.value = it.images ? [...it.images] : []
    pendingFiles.value = []
  },
  { immediate: true }
)

// ImageDropzone 已完成「类型 / 大小 / 张数」预检；编辑场景沿用既有流程：先攒成待上传队列，点「保存」时统一上传
function onPickImageFiles(files: File[]) {
  pendingFiles.value.push(...files)
}
const pendingNote = computed(() => (pendingFiles.value.length ? `已选 ${pendingFiles.value.length} 张新图片，点「保存」后一并上传` : ''))
function removeExistingImage(idx: number) {
  imageUrls.value.splice(idx, 1)
}

async function onSave() {
  if (!props.item) return
  if (!title.value.trim()) { ElMessage.warning('请填写物品标题'); return }
  const payload = {
    title: title.value.trim(),
    description: description.value.trim(),
    // 后端 location_id 精确匹配、不递归子节点，故级联必须选到叶子，取末位作为 location_id
    location_id: locPath.value.length ? locPath.value[locPath.value.length - 1] : undefined,
    location_detail: locDetail.value.trim() || undefined,
    tag_ids: selectedTags.value.map((t) => store.tagIdByName[t]).filter((x): x is number => x != null),
  }
  try {
    await store.updateMyItem(props.item.id, payload)   // POST /item/update（仅本人可操作）
    if (pendingFiles.value.length) {
      const newUrls = await Promise.all(pendingFiles.value.map(uploadImage))
      const all = [...imageUrls.value, ...newUrls]
      await setItemImages(props.item.id, all.map((u, i) => ({ image_url: u, sort_order: i + 1 })))
    }
    ElMessage.success('已保存修改')
    emit('saved')
    emit('close')
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    ElMessage.error(/无权利|无权限|permission|forbidden|403|10005|10006/i.test(msg)
      ? '保存失败：权限不足或登录已失效，请重新登录后重试'
      : (msg || '保存失败，请稍后重试'))
  }
}
</script>

<template>
  <el-dialog :model-value="visible" title="编辑发布信息" width="520px" @close="emit('close')">
    <div v-if="item" class="edit-form">
      <label class="ef-field">
        <span>类型</span>
        <el-input :model-value="typeLabel" disabled />
      </label>
      <label class="ef-field">
        <span>标题 <i class="req">*</i></span>
        <el-input v-model="title" placeholder="物品名称" />
      </label>
      <label class="ef-field">
        <span>标签</span>
        <el-select v-model="selectedTags" multiple filterable placeholder="选择标签" style="width:100%">
          <el-option v-for="t in store.tags" :key="t.id" :label="t.name" :value="t.name" />
        </el-select>
      </label>
      <label class="ef-field">
        <span>地点</span>
        <el-cascader v-model="locPath" :options="locationOptions" :props="{ expandTrigger: 'hover' }" placeholder="选择地点（选到最末级）" clearable style="width:100%" />
      </label>
      <label class="ef-field">
        <span>详细地点信息</span>
        <el-input v-model="locDetail" placeholder="如：图书馆三楼靠窗自习区" />
      </label>
      <!-- 用 div 而非 label：label 内不允许块级元素（描述拖放区是 div） -->
      <div class="ef-field">
        <span>描述</span>
        <div class="desc-dropzone" :class="{ 'drag-over': descDragOver }" @dragover.prevent="descDragOver = true" @dragleave.prevent="descDragOver = false" @drop="onDescDrop">
          <el-input ref="descRef" v-model="description" type="textarea" :rows="4" placeholder="支持 Markdown：标题、**加粗**、列表，也可把图片直接拖进此框" />
        </div>
      </div>
      <!-- 用 div 而非 label：ImageDropzone 内部已有 file input，外层再包 label 会让「移除」点击也触发选文件 -->
      <div class="ef-field">
        <span>物品图片</span>
        <ImageDropzone mode="multi" :previews="imageUrls" :note="pendingNote" @files="onPickImageFiles" @remove="removeExistingImage" />
      </div>
    </div>
    <template #footer>
      <el-button @click="emit('close')">取消</el-button>
      <el-button type="primary" @click="onSave">保存</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.edit-form { display: flex; flex-direction: column; gap: 14px; }
.ef-field { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: #4b5563; }
.ef-field .req { color: #e06c75; font-style: normal; }
.desc-dropzone{padding:4px;border-radius:8px;transition:outline .15s}
.desc-dropzone.drag-over{outline:2px dashed var(--green);background:#f0f8f3}
</style>
