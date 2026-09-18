<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { useAppStore, type ItemType } from '../stores/app'

const store = useAppStore()
const categoryOptions = ['数码', '证件', '日用', '服饰', '书籍', '其他']
const locationTree = {
  南区: { 食堂: ['一楼', '二楼', '门口'], 图书馆: ['一楼', '二楼', '三楼'], 教学楼: ['A座', 'B座', 'C座'] },
  北区: { 宿舍楼: ['1号楼', '2号楼', '3号楼'], 体育馆: ['入口', '篮球场', '操场'], 研究院: ['主楼', '实验楼', '停车场'] },
  东区: { 校门: ['东门', '南门', '北门'], 行政楼: ['一楼', '二楼', '三楼'], 绿地: ['小广场', '操场', '景观区'] }
} as const

const form = ref({ type: 'lost' as ItemType, title: '', tags: [] as string[], location: '', contact: '', desc: '', images: [] as string[] })
const errors = ref<Record<string, string>>({})
const formRef = ref<FormInstance>()
const rules: FormRules = {
  title: [{ required: true, min: 2, message: '请输入至少 2 个字符的物品名称', trigger: 'blur' }],
  contact: [{ required: true, min: 5, message: '请输入有效联系方式', trigger: 'blur' }]
}
const locationSelections = ref({ campus: '', building: '', area: '' })
const buildingOptions = computed(() => Object.keys(locationTree[locationSelections.value.campus as keyof typeof locationTree] ?? {}))
const areaOptions = computed(() => {
  const campus = locationSelections.value.campus as keyof typeof locationTree
  const building = locationSelections.value.building as keyof typeof locationTree[typeof campus]
  return campus && building ? locationTree[campus][building] ?? [] : []
})

watch(() => locationSelections.value.campus, () => {
  locationSelections.value.building = ''
  locationSelections.value.area = ''
  form.value.location = locationSelections.value.campus
})
watch(() => locationSelections.value.building, () => {
  locationSelections.value.area = ''
  form.value.location = locationSelections.value.building ? `${locationSelections.value.campus} · ${locationSelections.value.building}` : locationSelections.value.campus
})
watch(() => locationSelections.value.area, () => {
  if (locationSelections.value.area) form.value.location = `${locationSelections.value.campus} · ${locationSelections.value.building} · ${locationSelections.value.area}`
})

function handleUpload(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || []).filter((file) => file.type.startsWith('image/'))
  const remaining = 3 - form.value.images.length
  if (files.length > remaining) ElMessage.error('最多只能上传3张图片')
  form.value.images = [...form.value.images, ...files.slice(0, remaining).map((file) => URL.createObjectURL(file))]
  input.value = ''
}

function removeImage(index: number) {
  const url = form.value.images[index]
  if (url) URL.revokeObjectURL(url)
  form.value.images.splice(index, 1)
}

function validateForm() {
  const nextErrors: Record<string, string> = {}
  if (form.value.title.trim().length < 2) nextErrors.title = '请输入至少 2 个字符的物品名称'
  if (!form.value.tags.length) nextErrors.tags = '请至少选择一个物品标签'
  if (!form.value.location) nextErrors.location = '请选择丢失或拾取地点'
  if (form.value.contact.trim().length < 5) nextErrors.contact = '请输入有效联系方式'
  if (form.value.desc.trim().length < 10) nextErrors.desc = '详细描述至少需要 10 个字符'
  errors.value = nextErrors
  return !Object.keys(nextErrors).length
}

function resetForm() {
  form.value = { type: 'lost', title: '', tags: [], location: '', contact: '', desc: '', images: [] }
  locationSelections.value = { campus: '', building: '', area: '' }
  errors.value = {}
}

function submitPost() {
  formRef.value?.validate((valid) => {
    if (!valid || !validateForm()) {
      ElMessage.error('请先完善表单信息')
      return
    }
    store.publish({ ...form.value, icon: form.value.type === 'lost' ? '◌' : '◉', color: 'blue', status: '待审核' })
    resetForm()
    ElMessage.success('信息已提交，等待管理员审核')
  })
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
          <el-form-item label="物品标签" :error="errors.tags">
            <el-select v-model="form.tags" multiple placeholder="请选择标签" class="publish-control">
              <el-option v-for="tag in categoryOptions" :key="tag" :label="tag" :value="tag" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="联系方式" prop="contact">
            <el-input v-model="form.contact" placeholder="手机号或微信号" />
          </el-form-item>
        </el-col>
      </el-row>

      <el-row :gutter="20">
        <el-col :span="12">
          <el-form-item label="丢失 / 拾取地点" :error="errors.location">
            <div class="location-selector">
              <el-select v-model="locationSelections.campus" placeholder="请选择校区"><el-option v-for="campus in Object.keys(locationTree)" :key="campus" :label="campus" :value="campus" /></el-select>
              <el-select v-model="locationSelections.building" placeholder="请选择地点" :disabled="!locationSelections.campus"><el-option v-for="building in buildingOptions" :key="building" :label="building" :value="building" /></el-select>
              <el-select v-model="locationSelections.area" placeholder="请选择具体位置" :disabled="!locationSelections.building"><el-option v-for="area in areaOptions" :key="area" :label="area" :value="area" /></el-select>
            </div>
          </el-form-item>
        </el-col>
        <el-col :span="12"><el-form-item label="已选择地点"><el-input v-model="form.location" readonly placeholder="选择后自动生成详细地点" /></el-form-item></el-col>
      </el-row>

      <el-row>
        <el-col :span="24"><el-form-item label="详细描述" :error="errors.desc"><el-input v-model="form.desc" type="textarea" :rows="4" placeholder="颜色、特征、时间等线索..." /></el-form-item></el-col>
      </el-row>

      <el-row>
        <el-col :span="24">
          <el-form-item label="物品图片">
            <label class="upload-box"><input type="file" accept="image/*" multiple @change="handleUpload" /><span>＋ 点击上传图片</span><small>支持 JPG、PNG，最多 3 张</small></label>
            <div v-if="form.images.length" class="preview-grid"><div v-for="(image, index) in form.images" :key="image" class="preview-item"><el-image class="preview-image" :src="image" :preview-src-list="form.images" :initial-index="index" fit="cover" preview-teleported /><button type="button" class="remove-image" @click="removeImage(index)">×</button></div></div>
          </el-form-item>
        </el-col>
      </el-row>

      <el-button type="primary" native-type="submit" class="publish-submit">提交审核</el-button>
    </el-form>
  </section>
</template>

<style scoped>
.publish-page{max-width:920px;margin:0 auto}.publish-intro{margin-bottom:24px}.publish-intro h1{margin:12px 0 8px;font-size:32px}.publish-intro p{margin:0;color:var(--muted)}.publish-form{padding:26px;background:#fff;border:1px solid var(--line);border-radius:14px}.publish-control,.publish-form .el-input,.publish-form .el-textarea,.publish-form .el-radio-group{width:100%}.publish-type{display:flex}.publish-type .el-radio-button{flex:1}.publish-type :deep(.el-radio-button__inner){width:100%}.location-selector{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;width:100%}.upload-box{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-height:90px;border:1px dashed #c8d7cd;border-radius:10px;background:#fbfdfb;color:var(--green);cursor:pointer}.upload-box:hover{background:#f0f8f3}.upload-box input{display:none}.upload-box small{color:var(--muted);font-weight:400}.preview-grid{display:flex;flex-wrap:wrap;gap:12px;margin-top:14px}.preview-item{position:relative;width:120px;height:120px;overflow:hidden;border-radius:10px}.preview-image{width:120px;height:120px}.remove-image{position:absolute;top:6px;right:6px;width:23px;height:23px;border:0;border-radius:50%;background:#19332fcc;color:#fff;font-size:16px;cursor:pointer}.publish-submit{width:100%;margin-top:8px}@media(max-width:700px){.publish-page{width:100%}.publish-form{padding:18px}.publish-form :deep(.el-col){max-width:100%;flex:0 0 100%}.location-selector{grid-template-columns:1fr}}
</style>
