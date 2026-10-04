<script setup lang="ts">
import { ref, onMounted } from 'vue'
const descRef = ref<any>(null)
const descDragOver = ref(false)
function insertDescAtCursor(snippet: string) {
  const ta = descRef.value?.textarea as HTMLTextAreaElement | undefined
  const pos = ta ? ta.selectionStart : form.value.desc.length
  const cur = form.value.desc
  form.value.desc = cur.slice(0, pos) + snippet + cur.slice(pos)
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
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { useAppStore, type ItemType } from '../stores/app'
import LocationSelector from './LocationSelector.vue'
import { createItem, setItemImages, listMyItems } from '../api/item'
import { uploadImage } from '../api/upload'
const store = useAppStore()

// 进入发布页时拉取真实标签（后端 /tag/list），否则下拉 store.tags 一直为空 -> 显示 no data
onMounted(() => { store.fetchTags() })

const form = ref({ type: 'lost' as ItemType, title: '', tags: [] as string[], location: '', locationId: null as number | null, locationDetail: '', contact: '', desc: '', images: [] as string[] })
const errors = ref<Record<string, string>>({})
const formRef = ref<FormInstance>()
const locationSelectorRef = ref<InstanceType<typeof LocationSelector>>()
const selectedFiles = ref<File[]>([])
const rules: FormRules = {
  title: [{ required: true, min: 2, message: '请输入至少 2 个字符的物品名称', trigger: 'blur' }],
  contact: [{ required: true, min: 5, message: '请输入有效联系方式', trigger: 'blur' }]
}

function handleUpload(event: Event) {
  const input = event.target as HTMLInputElement
  const picked = Array.from(input.files || []).filter((file) => file.type.startsWith('image/'))
  const remaining = 3 - form.value.images.length
  if (picked.length > remaining) ElMessage.error('最多只能上传3张图片')
  const accepted = picked.slice(0, remaining)
  selectedFiles.value.push(...accepted)
  form.value.images = [...form.value.images, ...accepted.map((file) => URL.createObjectURL(file))]
  input.value = ''
}

function removeImage(index: number) {
  const url = form.value.images[index]
  if (url) URL.revokeObjectURL(url)
  form.value.images.splice(index, 1)
  selectedFiles.value.splice(index, 1)
}

function validateForm() {
  const nextErrors: Record<string, string> = {}
  if (form.value.title.trim().length < 2) nextErrors.title = '请输入至少 2 个字符的物品名称'
  if (!form.value.tags.length) nextErrors.tags = '请至少选择一个物品标签'
  const loc = locationSelectorRef.value?.validate()
  if (!loc?.valid) {
    nextErrors.location = loc?.message ?? '请选择丢失或拾取地点'
  }
  if (form.value.contact.trim().length < 5) nextErrors.contact = '请输入有效联系方式'
  if (form.value.desc.trim().length < 10) nextErrors.desc = '详细描述至少需要 10 个字符'
  errors.value = nextErrors
  return !Object.keys(nextErrors).length
}

function resetForm() {
  form.value = { type: 'lost', title: '', tags: [], location: '', locationId: null, locationDetail: '', contact: '', desc: '', images: [] }
  selectedFiles.value = []
  locationSelectorRef.value?.reset()
  errors.value = {}
}

async function submitPost() {
  formRef.value?.validate(async (valid) => {
    if (!valid || !validateForm()) {
      ElMessage.error('请先完善表单信息')
      return
    }
    try {
      const tagIds = form.value.tags
        .map((name) => store.tagIdByName[name])
        .filter((id): id is number => id != null)
      await createItem({
        title: form.value.title,
        description: form.value.desc,
        type: form.value.type === 'lost' ? 0 : 1,
        lost_found_time: new Date().toISOString(),
        contact: form.value.contact,
        location_detail: form.value.locationDetail || form.value.location,
        location_id: form.value.locationId ?? undefined,
        tag_ids: tagIds,
      })
      // 选了图片则上传。后端 /item/create 不返回 id，改为拉取"我的发布"最新一条取 id
      if (selectedFiles.value.length) {
        const newId = await fetchNewItemId()
        if (newId == null) {
          ElMessage.warning('发布成功，但图片上传未能获取物品ID，可稍后在"我的发布"编辑补充')
        } else {
          const urls = await Promise.all(selectedFiles.value.map(uploadImage))
          await setItemImages(newId, urls.map((u, i) => ({ image_url: u, sort_order: i + 1 })))
        }
      }
      resetForm()
      ElMessage.success('发布成功，所有人可在首页看到')
    } catch (e) {
      ElMessage.error((e as Error).message || '发布失败，请重试')
    }
  })
}

// 后端 /item/create 不返回 id，这里取"我的发布"里 created_at 最新的一条作为刚创建的帖子 id
async function fetchNewItemId(): Promise<number | null> {
  try {
    const res = await listMyItems()
    const items = res.data?.items ?? []
    if (!items.length) return null
    return items.reduce((a, b) => (b.created_at > a.created_at ? b : a)).id
  } catch {
    return null
  }
}

</script>

<template>
  <section class="publish-page">
    <div class="publish-intro">
      <span class="eyebrow">CREATE A POST</span>
      <h1>发布一条信息</h1>
      <p>描述得越清楚，物品越快回到主人身边。</p>
    </div>

    <el-form ref="formRef" :model="form" :rules="rules" class="publish-form" label-position="top" @submit.prevent="submitPost">
      <el-row :gutter="20">
        <el-col :span="12">
          <el-form-item label="信息类型">
            <el-radio-group v-model="form.type" class="publish-type">
              <el-radio-button value="lost">我丢失了物品</el-radio-button>
              <el-radio-button value="found">我捡到了物品</el-radio-button>
            </el-radio-group>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="物品名称" prop="title">
            <el-input v-model="form.title" placeholder="例如：黑色折叠雨伞" />
          </el-form-item>
        </el-col>
      </el-row>

      <el-row :gutter="20">
        <el-col :span="12">
          <el-form-item label="物品标签" :error="errors.tags" required>
            <el-select v-model="form.tags" multiple filterable placeholder="请选择标签" class="publish-control">
              <el-option v-for="tag in store.tags" :key="tag.id" :label="tag.name" :value="tag.name" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="联系方式" prop="contact">
            <el-input v-model="form.contact" placeholder="手机号或微信号" />
          </el-form-item>
        </el-col>
      </el-row>

      <el-form-item label="丢失 / 拾取地点" :error="errors.location" required>
        <LocationSelector ref="locationSelectorRef" v-model="form.location" v-model:location-id="form.locationId" />
      </el-form-item>

      <el-form-item label="详细地点信息">
        <el-input v-model="form.locationDetail" placeholder="选完地点后可补充更细描述，如：靠窗自习室 / 桥头左侧（可选）" />
      </el-form-item>

      <el-row>
        <el-col :span="24"><el-form-item label="详细描述" :error="errors.desc" required><div class="desc-dropzone" :class="{ 'drag-over': descDragOver }" @dragover.prevent="descDragOver = true" @dragleave.prevent="descDragOver = false" @drop="onDescDrop">
            <el-input ref="descRef" v-model="form.desc" type="textarea" :rows="6" placeholder="支持 Markdown：标题、**加粗**、列表，也可把图片直接拖进此框" />
          </div></el-form-item></el-col>
      </el-row>

      <el-row>
        <el-col :span="24">
          <el-form-item label="物品图片">
            <label class="upload-box"><input type="file" accept="image/*" multiple @change="handleUpload" /><span>＋ 点击上传图片</span><small>支持 JPG、PNG，最多 3 张</small></label>
            <div v-if="form.images.length" class="preview-grid"><div v-for="(image, index) in form.images" :key="image" class="preview-item"><el-image class="preview-image" :src="image" :preview-src-list="form.images" :initial-index="index" fit="cover" preview-teleported /><button type="button" class="remove-image" @click="removeImage(index)">×</button></div></div>
          </el-form-item>
        </el-col>
      </el-row>

      <el-button type="primary" native-type="submit" class="publish-submit">发布</el-button>
    </el-form>
  </section>
</template>

<style scoped>
.publish-page{max-width:920px;margin:0 auto}.publish-intro{margin-bottom:24px}.publish-intro h1{margin:12px 0 8px;font-size:32px}.publish-intro p{margin:0;color:var(--muted)}.publish-form{padding:26px;background:#fff;border:1px solid var(--line);border-radius:14px}.publish-control,.publish-form .el-input,.publish-form .el-textarea,.publish-form .el-radio-group{width:100%}.publish-type{display:flex}.publish-type .el-radio-button{flex:1}.publish-type :deep(.el-radio-button__inner){width:100%}.upload-box{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-height:90px;border:1px dashed #c8d7cd;border-radius:10px;background:#fbfdfb;color:var(--green);cursor:pointer}.upload-box:hover{background:#f0f8f3}.upload-box input{display:none}.upload-box small{color:var(--muted);font-weight:400}.preview-grid{display:flex;flex-wrap:wrap;gap:12px;margin-top:14px}.preview-item{position:relative;width:120px;height:120px;overflow:hidden;border-radius:10px}.preview-image{width:120px;height:120px}.remove-image{position:absolute;top:6px;right:6px;width:23px;height:23px;border:0;border-radius:50%;background:#19332fcc;color:#fff;font-size:16px;cursor:pointer}.publish-form :deep(.el-textarea){width:100%}.publish-form :deep(.el-textarea__inner){width:100%}.publish-submit{width:100%;margin-top:8px}.desc-dropzone{padding:4px;border-radius:8px;transition:outline .15s}.desc-dropzone.drag-over{outline:2px dashed var(--green);background:#f0f8f3}@media(max-width:700px){.publish-page{width:100%}.publish-form{padding:18px}.publish-form :deep(.el-col){max-width:100%;flex:0 0 100%}}
</style>
