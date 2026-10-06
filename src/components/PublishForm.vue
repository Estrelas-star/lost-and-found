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
    } catch (err) {
      ElMessage.error((err as Error).message || '图片上传失败，请重试')
    }
  }
}
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { useAppStore, type ItemType } from '../stores/app'
import LocationSelector from './LocationSelector.vue'
import TagWall from './TagWall.vue'
import { createItem } from '../api/item'
import { uploadImage } from '../api/upload'
import AgentWriteDialog from './AgentWriteDialog.vue'
import ImageDropzone from './ImageDropzone.vue'
import type { AgentDraft } from '../api/agent'
const store = useAppStore()

// 进入发布页时拉取真实标签（后端 /tag/list），否则下拉 store.tags 一直为空 -> 显示 no data
onMounted(() => { store.fetchTags() })

const form = ref({ type: 'lost' as ItemType, title: '', tags: [] as string[], location: '', locationId: null as number | null, locationDetail: '', contact: '', desc: '' })
const errors = ref<Record<string, string>>({})
const formRef = ref<FormInstance>()
const locationSelectorRef = ref<InstanceType<typeof LocationSelector>>()
const rules: FormRules = {
  title: [{ required: true, min: 2, message: '请输入至少 2 个字符的物品名称', trigger: 'blur' }],
  contact: [{ required: true, min: 5, message: '请输入有效联系方式', trigger: 'blur' }]
}

// —— AI 帮写：把 /agent/extract 抽出的草稿灌进表单（只填表，不发布）——
const writeDialogVisible = ref(false)
function applyDraft(draft: AgentDraft) {
  form.value.type = draft.type === 0 ? 'lost' : 'found'
  if (draft.title) form.value.title = draft.title
  if (draft.description) form.value.desc = draft.description
  if (draft.contact) form.value.contact = draft.contact
  // tag_names 只保留标签表里真实存在的名字，否则提交时 tagIdByName 映射不到 tag_id
  if (draft.tag_names?.length) {
    const known = draft.tag_names.filter((name) => store.tags.some((t) => t.name === name))
    if (known.length) form.value.tags = known
  }
  // 地点：有 location_id 时按叶子 id 反推级联链路回填；否则退化为文本
  if (draft.location_id != null) {
    locationSelectorRef.value?.setLocation(draft.location_id)
  } else if (draft.location_name) {
    form.value.location = draft.location_name
  }
  if (draft.location_detail) form.value.locationDetail = draft.location_detail
  errors.value = {}
  ElMessage.success('已根据描述填入表单，请核对后发布')
}


// 图片上传：ImageDropzone 已完成「类型 / 大小 / 张数」预检，这里逐张上传并把 Markdown 插到描述光标处
const descUploading = ref(false)
async function handlePickImages(files: File[]) {
  if (!files.length) return
  descUploading.value = true
  try {
    for (const f of files) {
      try {
        const url = await uploadImage(f)
        insertDescAtCursor(`\n![图片](${url})\n`)
        ElMessage.success('图片已插入描述')
      } catch (err) {
        ElMessage.error((err as Error).message || '图片上传失败，请重试')
      }
    }
  } finally {
    descUploading.value = false
  }
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
  form.value = { type: 'lost', title: '', tags: [], location: '', locationId: null, locationDetail: '', contact: '', desc: '' }
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
      resetForm()
      ElMessage.success('发布成功，所有人可在首页看到')
      store.activeRoute = 'posts'  // 发布成功后自动跳转到“我的发布”
    } catch (e) {
      ElMessage.error((e as Error).message || '发布失败，请重试')
    }
  })
}

</script>

<template>
  <section class="publish-page">
    <div class="publish-intro">
      <div class="publish-intro-head">
        <div>
          <span class="eyebrow">CREATE A POST</span>
          <h1>发布一条信息</h1>
          <p>描述得越清楚，物品越快回到主人身边。</p>
        </div>
      </div>
    </div>

    <el-form ref="formRef" :model="form" :rules="rules" class="publish-form" label-position="top" @submit.prevent="submitPost">
      <el-row :gutter="20">
        <el-col :span="12">
          <el-form-item label="物品名称" prop="title">
            <el-input v-model="form.title" placeholder="例如：黑色折叠雨伞" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="信息类型">
            <!-- 类型选项收窄，右侧留给「AI 帮写」按钮 -->
            <div class="publish-type-row">
              <el-radio-group v-model="form.type" class="publish-type">
                <el-radio-button value="lost">我丢失了物品</el-radio-button>
                <el-radio-button value="found">我捡到了物品</el-radio-button>
              </el-radio-group>
              <button type="button" class="ai-write-btn" @click="writeDialogVisible = true">✦ AI 帮写</button>
            </div>
          </el-form-item>
        </el-col>
      </el-row>

      <el-row :gutter="20">
        <el-col :span="12">
          <el-form-item label="物品标签" :error="errors.tags" required>
            <TagWall v-model="form.tags" :options="store.tags.map(t => t.name)" label="标签" :sidebar-width="246" />
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
        <el-col :span="24"><el-form-item label="物品图片">
          <ImageDropzone mode="multi" :max="9" :loading="descUploading" label="拖拽图片到此处，或点击选择" hint="支持 JPG / PNG / WEBP，单张 ≤5MB；上传后会以 Markdown 自动插入上方描述中" @files="handlePickImages" />
        </el-form-item></el-col>
      </el-row>

      <el-button type="primary" native-type="submit" class="publish-submit">发布</el-button>
    </el-form>

    <!-- AI 帮写：只做智能填充（POST /agent/extract），不建帖 -->
    <AgentWriteDialog :visible="writeDialogVisible" @close="writeDialogVisible = false" @apply="applyDraft" />
  </section>
</template>

<style scoped>
.publish-page{max-width:var(--page-max);margin:0 auto}.publish-intro{margin-bottom:24px}.publish-intro h1{margin:12px 0 8px;font-size:32px}.publish-intro p{margin:0;color:var(--muted)}.publish-form{padding:26px;background:#fff;border:1px solid var(--line);border-radius:14px}.publish-control,.publish-form .el-input,.publish-form .el-textarea,.publish-form .el-radio-group{width:100%}.publish-type{display:flex}.publish-type .el-radio-button{flex:1}.publish-type :deep(.el-radio-button__inner){width:100%}.publish-type :deep(.el-radio-button__inner:hover){color:var(--el-color-primary)}.publish-type :deep(.el-radio-button.is-active .el-radio-button__inner){background-color:var(--el-color-primary);border-color:var(--el-color-primary);box-shadow:-1px 0 0 0 var(--el-color-primary);color:#fff}.publish-type :deep(.el-radio-button.is-active .el-radio-button__inner:hover){background-color:var(--el-color-primary-dark-2);border-color:var(--el-color-primary-dark-2);box-shadow:-1px 0 0 0 var(--el-color-primary-dark-2);color:#fff}.publish-form :deep(.el-textarea){width:100%}.publish-form :deep(.el-textarea__inner){width:100%}.publish-submit{width:100%;margin-top:8px}.desc-dropzone{padding:4px;border-radius:8px;transition:outline .15s;width:100%;box-sizing:border-box}.desc-dropzone.drag-over{outline:2px dashed var(--green);background:#f0f8f3}@media(max-width:700px){.publish-page{width:100%}.publish-form{padding:18px}.publish-form :deep(.el-col){max-width:100%;flex:0 0 100%}}
.publish-intro-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap}
.ai-write-btn{display:inline-flex;align-items:center;gap:6px;padding:0 16px;height:38px;border:0;border-radius:10px;background:linear-gradient(135deg,var(--green) 0%,var(--green-dark) 100%);color:#fff;font-size:13px;font-weight:700;white-space:nowrap;box-shadow:0 6px 14px #42b9833d;transition:box-shadow var(--dur) var(--ease),transform var(--dur) var(--ease)}
.ai-write-btn:hover{box-shadow:0 9px 20px #42b98359;transform:translateY(-1px)}
.publish-type-row{display:flex;align-items:center;gap:12px;width:100%}
.publish-type-row .publish-type{flex:0 1 300px;min-width:0}
@media(max-width:700px){.publish-type-row{flex-direction:column;align-items:stretch}.publish-type-row .publish-type{flex:1 1 auto}.ai-write-btn{width:100%;justify-content:center}}
</style>
