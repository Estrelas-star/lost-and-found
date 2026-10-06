<script setup lang="ts">
// Agent 多模态图片选择器（最多 max 张）：被智能助手对话页与发布页「AI 帮写」共用
// 复用 POST /upload/image（JPG / PNG / WEBP，单张 ≤5MB，代理 502 抖动自动重试）；
// 上传返回相对 URL（/uploads/...），后端会自动拼公网前缀，因此原样提交给 /agent/* 的 image_urls。
// 两种用法：
//   · 默认（hideAdd=false）：整块 ImageDropzone（点选 + 拖入），供发布页「AI 帮写」使用；
//   · hideAdd=true：只渲染缩略图，上传入口由父组件通过 ref 调 pick() / addFiles() 触发
//     （智能助手页把入口改成了输入框右下角的小图片图标 + 整块对话区拖拽）。
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { uploadImage } from '../api/upload'
import { resolveImageUrl } from '../utils/image'
import { filterImageFiles } from '../utils/imageFile'
import ImageDropzone from './ImageDropzone.vue'

const props = withDefaults(defineProps<{
  modelValue: string[]
  max?: number
  disabled?: boolean
  /** true 时不再渲染上传区，只显示已选缩略图（上传入口由父组件提供） */
  hideAdd?: boolean
}>(), {
  max: 3,
  disabled: false,
  hideAdd: false,
})

const emit = defineEmits<{ 'update:modelValue': [string[]] }>()

const uploading = ref(false)
const fileRef = ref<HTMLInputElement | null>(null)
const busy = computed(() => props.disabled || uploading.value)

// 串行上传，保证顺序与选择顺序一致；用本地 working 累积，避免 props 异步回流导致丢图
async function uploadAll(files: File[]) {
  if (!files.length) return
  uploading.value = true
  const working = [...props.modelValue]
  try {
    for (const file of files) {
      try {
        working.push(await uploadImage(file))
        emit('update:modelValue', [...working])
      } catch (err) {
        ElMessage.error((err as Error).message || '图片上传失败，请重试')
      }
    }
  } finally {
    uploading.value = false
  }
}

// 默认模式的 ImageDropzone 已完成预检，这里直接上传
function onPick(e: Event) {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files || [])
  input.value = ''   // 清空 value，允许重复选择同一个文件
  uploadAll(files)
}

/** 外部触发选文件（智能助手页输入框右下角的小图片图标） */
function pick() {
  if (busy.value) return
  fileRef.value?.click()
}
/** 外部传入文件（整块对话区拖拽上传） */
async function addFiles(list: FileList | File[] | null | undefined) {
  if (busy.value) return
  const picked = filterImageFiles(list, { max: props.max, current: props.modelValue.length })
  if (picked.length) await uploadAll(picked)
}
defineExpose({ pick, addFiles })

function removeAt(index: number) {
  emit('update:modelValue', props.modelValue.filter((_, i) => i !== index))
}
</script>

<template>
  <div v-if="hideAdd" class="aip">
    <input ref="fileRef" class="aip-input" type="file" accept="image/*" multiple :disabled="busy" @change="onPick" />
    <div v-if="modelValue.length" class="aip-thumbs">
      <div v-for="(url, i) in modelValue" :key="url + '@' + i" class="aip-thumb">
        <img :src="resolveImageUrl(url)" :alt="`待提交图片 ${i + 1}`" />
        <button type="button" class="aip-del" :disabled="disabled" :title="`移除第 ${i + 1} 张`" @click="removeAt(i)">×</button>
      </div>
      <span class="aip-count">{{ uploading ? '上传中…' : `${modelValue.length}/${max}` }}</span>
    </div>
  </div>
  <ImageDropzone
    v-else
    mode="multi"
    :previews="modelValue"
    :max="max"
    :disabled="disabled"
    :loading="uploading"
    label="拖拽物品照片到此处，或点击选择"
    :hint="`JPG / PNG / WEBP，单张 ≤5MB；图片可辅助助手识别（最多 ${max} 张）`"
    :note="modelValue.length ? `已选 ${modelValue.length}/${max} 张` : ''"
    @files="uploadAll"
    @remove="removeAt"
  />
</template>

<style scoped>
.aip{display:flex;flex-direction:column;gap:8px}
.aip-input{display:none}
.aip-thumbs{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.aip-thumb{position:relative;width:54px;height:54px;border-radius:var(--radius-sm);overflow:hidden;border:1px solid var(--line);background:var(--surface-sidebar)}
.aip-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.aip-del{position:absolute;top:0;right:0;width:18px;height:18px;padding:0;border:0;border-radius:0 var(--radius-sm) 0 var(--radius-sm);background:#000000a6;color:#fff;font-size:12px;line-height:1;display:grid;place-items:center;cursor:pointer}
.aip-del:hover{background:#e06c75}
.aip-del:disabled{opacity:.45;cursor:not-allowed}
.aip-count{color:var(--muted-2);font-size:11px}
</style>
