<script setup lang="ts">
// Agent 多模态图片选择器（最多 max 张）：被智能助手对话页与发布页「AI 帮写」共用
// 复用 POST /upload/image（JPG / PNG / WEBP，单张 ≤5MB，代理 502 抖动自动重试）；
// 上传返回相对 URL（/uploads/...），后端会自动拼公网前缀，因此原样提交给 /agent/* 的 image_urls。
// 交互统一交给 ImageDropzone：整宽 + 大高度 + 浅色空盒子图标，支持拖入与点击选择。
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { uploadImage } from '../api/upload'
import ImageDropzone from './ImageDropzone.vue'

const props = withDefaults(defineProps<{
  modelValue: string[]
  max?: number
  disabled?: boolean
}>(), {
  max: 3,
  disabled: false,
})
const emit = defineEmits<{ 'update:modelValue': [string[]] }>()

const uploading = ref(false)

// ImageDropzone 已完成「类型 / 大小 / 张数」预检，这里只负责串行上传，保证顺序与选择顺序一致；
// 用本地 working 累积，避免 props 异步回流导致丢图
async function onFiles(files: File[]) {
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

function removeAt(index: number) {
  emit('update:modelValue', props.modelValue.filter((_, i) => i !== index))
}
</script>

<template>
  <ImageDropzone
    mode="multi"
    :previews="modelValue"
    :max="max"
    :disabled="disabled"
    :loading="uploading"
    label="拖拽物品照片到此处，或点击选择"
    :hint="`JPG / PNG / WEBP，单张 ≤5MB；图片可辅助助手识别（最多 ${max} 张）`"
    :note="modelValue.length ? `已选 ${modelValue.length}/${max} 张` : ''"
    @files="onFiles"
    @remove="removeAt"
  />
</template>
